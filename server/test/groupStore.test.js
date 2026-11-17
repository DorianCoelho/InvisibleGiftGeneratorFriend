import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { GroupStore } from '../src/storage/groupStore.js';

async function tempStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amigo-store-'));
  const store = new GroupStore({ dataDir, backupsToKeep: 2 });
  await store.init();
  return { store, dataDir };
}

const baseDocs = () => ({
  group: { id: 'x', status: 'collecting' },
  participants: { participants: [] },
  preferences: { byParticipant: {} },
});

test('crea un grupo de forma atómica y lo lee', async () => {
  const { store } = await tempStore();
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  assert.equal(await store.exists(id), true);
  assert.deepEqual(await store.read(id, 'group'), { id: 'x', status: 'collecting' });
  assert.equal(await store.read(id, 'draw'), null);
});

test('rechaza identificadores que intentan salir del directorio', async () => {
  const { store } = await tempStore();
  for (const bad of ['../etc', '..', 'a/b', `${crypto.randomUUID()}/../x`, '']) {
    await assert.rejects(() => store.read(bad, 'group'));
  }
  await assert.rejects(() => store.read(crypto.randomUUID(), '../../secret'));
});

test('escrituras concurrentes bajo candado no pierden datos', async () => {
  const { store } = await tempStore();
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      store.withLock(id, async () => {
        const prefs = await store.read(id, 'preferences');
        await new Promise((r) => setTimeout(r, Math.random() * 3));
        prefs.byParticipant[`p${i}`] = { items: [i] };
        await store.write(id, 'preferences', prefs);
      }),
    ),
  );
  const prefs = await store.read(id, 'preferences');
  assert.equal(Object.keys(prefs.byParticipant).length, 50);
});

test('restaura un archivo dañado desde la copia de seguridad', async () => {
  const { store, dataDir } = await tempStore();
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  await fs.writeFile(path.join(dataDir, 'Groups', id, 'group.json'), '{ corrupto');
  assert.deepEqual(await store.read(id, 'group'), { id: 'x', status: 'collecting' });
});

test('mantiene solo las últimas N copias y elimina todo al borrar', async () => {
  const { store, dataDir } = await tempStore();
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  for (let i = 0; i < 4; i++) {
    await store.withLock(id, () => store.backup(id, `b${i}`));
    await new Promise((r) => setTimeout(r, 5));
  }
  const backups = await fs.readdir(path.join(dataDir, 'Backups', id));
  assert.equal(backups.length, 2);
  await store.remove(id);
  assert.equal(await store.exists(id), false);
  await assert.rejects(() => fs.access(path.join(dataDir, 'Backups', id)));
});

test('no deja archivos temporales tras escribir', async () => {
  const { store, dataDir } = await tempStore();
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  await store.withLock(id, () => store.write(id, 'group', { ok: true }));
  const files = await fs.readdir(path.join(dataDir, 'Groups', id));
  assert.ok(files.every((f) => !f.endsWith('.tmp')));
});
