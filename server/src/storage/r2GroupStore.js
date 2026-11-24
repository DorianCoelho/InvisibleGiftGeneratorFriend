import crypto from 'node:crypto';
import { DataCorruptionError } from '../errors.js';
import { GROUP_FILES, isValidGroupId } from './groupStore.js';
import { KeyedMutex } from './keyedMutex.js';
import { PreconditionError } from './preconditionError.js';

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Los mismos JSON que GroupStore, guardados como objetos en Cloudflare R2.
 * El candado vive en el bucket para que varias instancias de Vercel no escriban
 * el mismo grupo a la vez.
 */
export class R2GroupStore {
  #mutex = new KeyedMutex();
  #client;

  constructor({ client, backupsToKeep = 5, logger }) {
    this.#client = client;
    this.backupsToKeep = backupsToKeep;
    this.logger = logger;
  }

  async init() {
    if (this.#client.headBucket) await this.#client.headBucket();
  }

  #id(groupId) {
    if (!isValidGroupId(groupId)) throw new Error('Identificador de grupo inválido');
    return groupId;
  }

  #liveKey(groupId, fileKey) {
    const file = GROUP_FILES[fileKey];
    if (!file) throw new Error(`Archivo desconocido: ${fileKey}`);
    return `Groups/${this.#id(groupId)}/${file}`;
  }

  #lockKey(groupId) {
    return `Groups/${this.#id(groupId)}/.lock`;
  }

  async #putJson(key, value, cond) {
    await this.#client.put(key, jsonText(value), cond);
  }

  withLock(groupId, fn) {
    const id = this.#id(groupId);
    return this.#mutex.run(id, async () => {
      const owner = await this.#acquire(id);
      try {
        return await fn();
      } finally {
        await this.#release(id, owner);
      }
    });
  }

  async #acquire(id) {
    const key = this.#lockKey(id);
    const owner = crypto.randomUUID();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const body = jsonText({ owner, expires: Date.now() + 20000 });
      try {
        await this.#client.put(key, body, { ifNoneMatch: '*' });
        return owner;
      } catch (err) {
        if (!(err instanceof PreconditionError)) throw err;
        const current = await this.#client.get(key);
        if (!current) continue;
        let held = null;
        try {
          held = JSON.parse(current.body);
        } catch {
          held = null;
        }
        if (!held || held.expires < Date.now()) {
          try {
            await this.#client.put(key, body, { ifMatch: current.etag });
            return owner;
          } catch (stealErr) {
            if (!(stealErr instanceof PreconditionError)) throw stealErr;
          }
        }
        await delay(40 + Math.random() * 40);
      }
    }
    throw new Error('No se pudo reservar el grupo para escribir. Inténtalo de nuevo.');
  }

  async #release(id, owner) {
    const key = this.#lockKey(id);
    try {
      const current = await this.#client.get(key);
      if (!current) return;
      const held = JSON.parse(current.body);
      if (held.owner !== owner) return;
      await this.#client.delete(key, { ifMatch: current.etag });
    } catch (err) {
      if (err instanceof PreconditionError || err instanceof SyntaxError) return;
      this.logger?.warn({ groupId: id, err }, 'No se pudo soltar el candado del grupo');
    }
  }

  async exists(groupId) {
    if (!isValidGroupId(groupId)) return false;
    return (await this.#client.get(this.#liveKey(groupId, 'group'))) !== null;
  }

  async listGroupIds() {
    const keys = await this.#client.list('Groups/');
    const ids = new Set();
    for (const key of keys) {
      const id = key.split('/')[1];
      if (key.endsWith('/group.json') && isValidGroupId(id)) ids.add(id);
    }
    return [...ids];
  }

  async read(groupId, fileKey) {
    const obj = await this.#client.get(this.#liveKey(groupId, fileKey));
    if (!obj) return null;
    try {
      return JSON.parse(obj.body);
    } catch (err) {
      if (err instanceof SyntaxError) return this.#recoverFromBackup(groupId, fileKey, err);
      throw err;
    }
  }

  async readMany(groupId, keys) {
    const values = await Promise.all(keys.map((key) => this.read(groupId, key)));
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  }

  async write(groupId, fileKey, value) {
    await this.#putJson(this.#liveKey(groupId, fileKey), value);
  }

  async create(groupId, docs) {
    await this.withLock(groupId, async () => {
      if (await this.exists(groupId)) throw new Error('El grupo ya existe');
      const written = [];
      try {
        for (const [fileKey, value] of Object.entries(docs)) {
          const key = this.#liveKey(groupId, fileKey);
          await this.#putJson(key, value, fileKey === 'group' ? { ifNoneMatch: '*' } : {});
          written.push(key);
        }
        await this.backup(groupId, 'created');
      } catch (err) {
        await Promise.all(written.map((key) => this.#client.delete(key).catch(() => {})));
        throw err;
      }
    });
  }

  async backup(groupId, reason) {
    const id = this.#id(groupId);
    const live = (await this.#client.list(`Groups/${id}/`)).filter((key) => key.endsWith('.json'));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = String(reason).replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'snapshot';
    const destDir = `Backups/${id}/${stamp}_${safeReason}`;
    try {
      for (const key of live) {
        const name = key.slice(key.lastIndexOf('/') + 1);
        await this.#client.copy(key, `${destDir}/${name}`);
      }
      await this.#pruneBackups(id);
    } catch (err) {
      this.logger?.error({ groupId: id, err }, 'No se pudo crear la copia de seguridad del grupo');
    }
  }

  async #pruneBackups(id) {
    const keys = await this.#client.list(`Backups/${id}/`);
    const dirs = new Map();
    for (const key of keys) {
      const dir = key.slice(`Backups/${id}/`.length).split('/')[0];
      if (!dir || dir.startsWith('.')) continue;
      if (!dirs.has(dir)) dirs.set(dir, []);
      dirs.get(dir).push(key);
    }
    const names = [...dirs.keys()].sort();
    for (const old of names.slice(0, Math.max(0, names.length - this.backupsToKeep))) {
      for (const key of dirs.get(old)) await this.#client.delete(key);
    }
  }

  async #recoverFromBackup(groupId, fileKey, cause) {
    const id = this.#id(groupId);
    const file = GROUP_FILES[fileKey];
    const copies = (await this.#client.list(`Backups/${id}/`)).filter((key) => key.endsWith(`/${file}`)).sort().reverse();
    for (const key of copies) {
      try {
        const obj = await this.#client.get(key);
        if (!obj) continue;
        const value = JSON.parse(obj.body);
        await this.#putJson(this.#liveKey(groupId, fileKey), value);
        this.logger?.warn({ groupId: id, file, backup: key }, 'Archivo dañado restaurado desde copia de seguridad');
        return value;
      } catch {
        // Probar con la siguiente copia.
      }
    }
    throw new DataCorruptionError(`${id}/${file}`, cause);
  }

  async remove(groupId) {
    const id = this.#id(groupId);
    for (const key of await this.#client.list(`Groups/${id}/`)) await this.#client.delete(key);
    await this.removeBackups(id);
  }

  #tombstoneKey(groupId) {
    return `Completed/${this.#id(groupId)}.json`;
  }

  async writeTombstone(groupId, data) {
    await this.#putJson(this.#tombstoneKey(groupId), data);
  }

  async readTombstone(groupId) {
    if (!isValidGroupId(groupId)) return null;
    const obj = await this.#client.get(`Completed/${groupId}.json`);
    if (!obj) return null;
    try {
      return JSON.parse(obj.body);
    } catch {
      return null;
    }
  }

  async listTombstones() {
    const ids = [];
    for (const key of await this.#client.list('Completed/')) {
      const name = key.slice('Completed/'.length);
      if (name.endsWith('.json') && isValidGroupId(name.slice(0, -5))) ids.push(name.slice(0, -5));
    }
    return ids;
  }

  async removeTombstone(groupId) {
    await this.#client.delete(this.#tombstoneKey(groupId));
  }

  async listBackupGroupIds() {
    const ids = new Set();
    for (const key of await this.#client.list('Backups/')) {
      const id = key.split('/')[1];
      if (isValidGroupId(id)) ids.add(id);
    }
    return [...ids];
  }

  async removeBackups(groupId) {
    if (!isValidGroupId(groupId)) return;
    for (const key of await this.#client.list(`Backups/${groupId}/`)) await this.#client.delete(key);
  }
}
