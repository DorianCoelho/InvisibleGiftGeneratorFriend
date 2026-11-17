import fs from 'node:fs/promises';
import path from 'node:path';
import { DataCorruptionError } from '../errors.js';
import { DIR_MODE, fsyncDirectory, readJsonFile, writeJsonAtomic } from './atomicFile.js';
import { KeyedMutex } from './keyedMutex.js';

/** Archivos permitidos dentro del directorio de un grupo (lista blanca). */
export const GROUP_FILES = Object.freeze({
  group: 'group.json',
  participants: 'participants.json',
  preferences: 'preferences.json',
  invitations: 'invitations.json',
  draw: 'draw.json',
  emailStatus: 'email-status.json',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isValidGroupId = (id) => typeof id === 'string' && UUID_RE.test(id);

/**
 * Servicio de persistencia basado en archivos JSON.
 *
 * Estructura:
 *   {dataDir}/Groups/{groupId}/*.json        datos vivos de cada grupo
 *   {dataDir}/Backups/{groupId}/{fecha}/     instantáneas completas del grupo
 *   {dataDir}/Completed/{groupId}.json       marcador sin datos personales de
 *                                            grupos finalizados y eliminados
 *
 * Toda modificación debe hacerse dentro de `withLock(groupId, fn)`, que
 * serializa las operaciones del mismo grupo para evitar condiciones de carrera.
 */
export class GroupStore {
  #mutex = new KeyedMutex();

  constructor({ dataDir, backupsToKeep = 5, logger }) {
    this.dataDir = path.resolve(dataDir);
    this.groupsDir = path.join(this.dataDir, 'Groups');
    this.backupsDir = path.join(this.dataDir, 'Backups');
    this.completedDir = path.join(this.dataDir, 'Completed');
    this.backupsToKeep = backupsToKeep;
    this.logger = logger;
  }

  async init() {
    for (const dir of [this.dataDir, this.groupsDir, this.backupsDir, this.completedDir]) {
      await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
    }
    await this.#cleanupLeftovers();
  }

  /** Elimina restos de operaciones interrumpidas (temporales, creaciones a medias). */
  async #cleanupLeftovers() {
    for (const entry of await fs.readdir(this.groupsDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) {
        await fs.rm(path.join(this.groupsDir, entry.name), { recursive: true, force: true });
        continue;
      }
      if (entry.isDirectory() && isValidGroupId(entry.name)) {
        const dir = path.join(this.groupsDir, entry.name);
        for (const file of await fs.readdir(dir)) {
          if (file.startsWith('.') && file.endsWith('.tmp')) await fs.rm(path.join(dir, file), { force: true });
        }
      }
    }
  }

  /** Resuelve el directorio de un grupo impidiendo el acceso fuera de Groups/. */
  #groupDir(groupId) {
    if (!isValidGroupId(groupId)) throw new Error('Identificador de grupo inválido');
    const dir = path.resolve(this.groupsDir, groupId);
    if (path.dirname(dir) !== this.groupsDir) throw new Error('Ruta fuera del directorio de datos');
    return dir;
  }

  #filePath(groupId, key) {
    const file = GROUP_FILES[key];
    if (!file) throw new Error(`Archivo desconocido: ${key}`);
    return path.join(this.#groupDir(groupId), file);
  }

  withLock(groupId, fn) {
    this.#groupDir(groupId);
    return this.#mutex.run(groupId, fn);
  }

  async exists(groupId) {
    if (!isValidGroupId(groupId)) return false;
    try {
      await fs.access(this.#filePath(groupId, 'group'));
      return true;
    } catch {
      return false;
    }
  }

  async listGroupIds() {
    const entries = await fs.readdir(this.groupsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && isValidGroupId(e.name)).map((e) => e.name);
  }

  async read(groupId, key) {
    const filePath = this.#filePath(groupId, key);
    try {
      return await readJsonFile(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      if (err instanceof SyntaxError) return this.#recoverFromBackup(groupId, key, err);
      throw err;
    }
  }

  async readMany(groupId, keys) {
    const values = await Promise.all(keys.map((key) => this.read(groupId, key)));
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  }

  async write(groupId, key, value) {
    await writeJsonAtomic(this.#filePath(groupId, key), value);
  }

  /** Crea un grupo completo de forma atómica: o existen todos sus archivos o ninguno. */
  async create(groupId, docs) {
    const finalDir = this.#groupDir(groupId);
    const stagingDir = path.join(this.groupsDir, `.creating-${groupId}`);
    await this.withLock(groupId, async () => {
      if (await this.exists(groupId)) throw new Error('El grupo ya existe');
      await fs.mkdir(stagingDir, { mode: DIR_MODE });
      try {
        for (const [key, value] of Object.entries(docs)) {
          if (!GROUP_FILES[key]) throw new Error(`Archivo desconocido: ${key}`);
          await writeJsonAtomic(path.join(stagingDir, GROUP_FILES[key]), value);
        }
        await fs.rename(stagingDir, finalDir);
        await fsyncDirectory(this.groupsDir);
      } catch (err) {
        await fs.rm(stagingDir, { recursive: true, force: true });
        throw err;
      }
      await this.backup(groupId, 'created');
    });
  }

  /**
   * Guarda una instantánea completa del grupo. Debe llamarse con el candado
   * del grupo adquirido para que la copia sea coherente.
   */
  async backup(groupId, reason) {
    const sourceDir = this.#groupDir(groupId);
    const groupBackupDir = path.join(this.backupsDir, groupId);
    await fs.mkdir(groupBackupDir, { recursive: true, mode: DIR_MODE });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = String(reason).replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'snapshot';
    const name = `${stamp}_${safeReason}`;
    const staging = path.join(groupBackupDir, `.${name}`);
    try {
      await fs.cp(sourceDir, staging, {
        recursive: true,
        filter: (src) => !path.basename(src).endsWith('.tmp'),
      });
      await fs.rename(staging, path.join(groupBackupDir, name));
      await this.#pruneBackups(groupBackupDir);
    } catch (err) {
      await fs.rm(staging, { recursive: true, force: true });
      this.logger?.error({ groupId, err }, 'No se pudo crear la copia de seguridad del grupo');
    }
  }

  async #listBackups(groupBackupDir) {
    try {
      const entries = await fs.readdir(groupBackupDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort();
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async #pruneBackups(groupBackupDir) {
    const backups = await this.#listBackups(groupBackupDir);
    for (const old of backups.slice(0, Math.max(0, backups.length - this.backupsToKeep))) {
      await fs.rm(path.join(groupBackupDir, old), { recursive: true, force: true });
    }
  }

  /** Si un archivo está dañado, se restaura la versión más reciente válida de las copias. */
  async #recoverFromBackup(groupId, key, cause) {
    const groupBackupDir = path.join(this.backupsDir, groupId);
    const backups = (await this.#listBackups(groupBackupDir)).reverse();
    for (const backup of backups) {
      try {
        const value = await readJsonFile(path.join(groupBackupDir, backup, GROUP_FILES[key]));
        await writeJsonAtomic(this.#filePath(groupId, key), value);
        this.logger?.warn({ groupId, file: GROUP_FILES[key], backup }, 'Archivo dañado restaurado desde copia de seguridad');
        return value;
      } catch {
        // Probar con la siguiente copia.
      }
    }
    throw new DataCorruptionError(`${groupId}/${GROUP_FILES[key]}`, cause);
  }

  /** Elimina definitivamente todos los datos (y copias) de un grupo. */
  async remove(groupId) {
    const dir = this.#groupDir(groupId);
    const trash = path.join(this.groupsDir, `.deleting-${groupId}`);
    try {
      await fs.rename(dir, trash);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    await fs.rm(trash, { recursive: true, force: true });
    await fs.rm(path.join(this.backupsDir, groupId), { recursive: true, force: true });
  }

  // --- Marcadores de grupos finalizados (sin datos personales) ---

  #tombstonePath(groupId) {
    if (!isValidGroupId(groupId)) throw new Error('Identificador de grupo inválido');
    return path.join(this.completedDir, `${groupId}.json`);
  }

  async writeTombstone(groupId, data) {
    await writeJsonAtomic(this.#tombstonePath(groupId), data);
  }

  async readTombstone(groupId) {
    if (!isValidGroupId(groupId)) return null;
    try {
      return await readJsonFile(this.#tombstonePath(groupId));
    } catch {
      return null;
    }
  }

  async listTombstones() {
    const files = await fs.readdir(this.completedDir);
    return files.filter((f) => f.endsWith('.json') && isValidGroupId(f.slice(0, -5))).map((f) => f.slice(0, -5));
  }

  async removeTombstone(groupId) {
    await fs.rm(this.#tombstonePath(groupId), { force: true });
  }

  async listBackupGroupIds() {
    const entries = await fs.readdir(this.backupsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && isValidGroupId(e.name)).map((e) => e.name);
  }

  async removeBackups(groupId) {
    if (!isValidGroupId(groupId)) return;
    await fs.rm(path.join(this.backupsDir, groupId), { recursive: true, force: true });
  }
}
