import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MemoryObjectClient } from '../src/storage/memoryObjectClient.js';
import { R2GroupStore } from '../src/storage/r2GroupStore.js';

const baseDocs = () => ({
  group: { id: 'x', status: 'collecting' },
  participants: { participants: [] },
  preferences: { byParticipant: {} },
});

const tempStore = () => new R2GroupStore({ client: new MemoryObjectClient(), backupsToKeep: 2 });

test('crea un grupo en el cubo y lo lee', async () => {
  const store = tempStore();
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  assert.equal(await store.exists(id), true);
  assert.deepEqual(await store.read(id, 'group'), { id: 'x', status: 'collecting' });
  assert.equal(await store.read(id, 'draw'), null);
  assert.deepEqual(await store.listGroupIds(), [id]);
});

test('rechaza identificadores que intentan salir del prefijo', async () => {
  const store = tempStore();
  for (const bad of ['../etc', '..', 'a/b', `${crypto.randomUUID()}/../x`, '']) {
    await assert.rejects(() => store.read(bad, 'group'));
  }
  await assert.rejects(() => store.read(crypto.randomUUID(), '../../secret'));
});

test('dos instancias no se pisan las escrituras del mismo grupo', async () => {
  const client = new MemoryObjectClient();
  const id = crypto.randomUUID();
  const first = new R2GroupStore({ client, backupsToKeep: 2 });
  const second = new R2GroupStore({ client, backupsToKeep: 2 });
  await first.create(id, baseDocs());
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => {
      const store = i % 2 === 0 ? first : second;
      return store.withLock(id, async () => {
        const prefs = await store.read(id, 'preferences');
        prefs.byParticipant[`p${i}`] = { items: [i] };
        await store.write(id, 'preferences', prefs);
      });
    }),
  );
  const prefs = await first.read(id, 'preferences');
  assert.equal(Object.keys(prefs.byParticipant).length, 20);
});

test('restaura un JSON dañado desde la copia y poda las antiguas', async () => {
  const client = new MemoryObjectClient();
  const store = new R2GroupStore({ client, backupsToKeep: 2 });
  const id = crypto.randomUUID();
  await store.create(id, baseDocs());
  for (let i = 0; i < 4; i++) {
    await store.withLock(id, () => store.backup(id, `b${i}`));
    await new Promise((r) => setTimeout(r, 5));
  }
  const backups = new Set(
    (await client.list(`Backups/${id}/`)).map((key) => key.slice(`Backups/${id}/`.length).split('/')[0]),
  );
  assert.equal(backups.size, 2);

  await client.put(`Groups/${id}/group.json`, '{ corrupto');
  assert.deepEqual(await store.read(id, 'group'), { id: 'x', status: 'collecting' });

  await store.remove(id);
  assert.equal(await store.exists(id), false);
  assert.deepEqual(await client.list(`Backups/${id}/`), []);
  assert.deepEqual(await client.list(`Groups/${id}/`), []);
});
