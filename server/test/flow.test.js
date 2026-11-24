import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { createApp } from '../src/app.js';
import { createCrypto } from '../src/security/crypto.js';
import { createServices } from '../src/services/index.js';
import { GroupStore } from '../src/storage/groupStore.js';

const waitFor = async (predicate, timeout = 3000) => {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeout) throw new Error('Tiempo de espera agotado');
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function setup({ deleteGroupWhenCompleted = true, failFor = new Set() } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amigo-flow-'));
  const config = {
    nodeEnv: 'test',
    appBaseUrl: 'https://amigo.test',
    trustProxy: 'false',
    forceHttps: false,
    dataDir,
    clientDistDir: path.join(dataDir, 'no-client'),
    invitationTtlHours: 72,
    groupRetentionDays: 90,
    backupsToKeep: 5,
    maxParticipants: 50,
    resendCooldownMinutes: 0,
    deleteGroupWhenCompleted,
    rateLimits: { createGroupPerHour: 100, resendPerHour: 100, apiPer15Min: 10000 },
    email: { maxAttempts: 2 },
  };
  const logger = pino({ level: 'silent' });
  const store = new GroupStore({ dataDir, logger });
  await store.init();
  const crypto = createCrypto('x'.repeat(40));
  const outbox = [];
  const sender = {
    async send(msg) {
      if (failFor.has(msg.to)) throw Object.assign(new Error('SMTP caído'), { code: 'ECONNREFUSED' });
      outbox.push(msg);
    },
  };
  const services = createServices({ config, store, crypto, sender, logger });
  const app = createApp({ config, services, logger });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (method, url, { token, body } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { api, outbox, store, dataDir, failFor, close: () => server.close() };
}

const groupPayload = () => ({
  name: 'Navidad 2026',
  budgetMin: 15,
  budgetMax: 30,
  currency: 'EUR',
  exchangeDate: null,
  organizer: { name: 'Ana', email: 'ana@example.com' },
  participants: [
    { ref: 'a', name: 'Pedro', email: 'pedro@example.com', exclusions: ['b'] },
    { ref: 'b', name: 'María', email: 'maria@example.com', exclusions: ['a'] },
    { ref: 'c', name: 'Luis', email: 'luis@example.com', exclusions: [] },
    { ref: 'd', name: 'Eva', email: 'eva@example.com', exclusions: [] },
  ],
});

const tokenFrom = (msg) => {
  const hashed = /#([A-Za-z0-9_-]{20,})/.exec(msg.text);
  if (hashed) return hashed[1];
  const inPath = /\/preferencias\/[0-9a-f-]{36}\/([A-Za-z0-9_-]{20,})/.exec(msg.text);
  if (inPath) return inPath[1];
  throw new Error(`No se encontró el token en el correo para ${msg.to}`);
};
const items = (n) => [1, 2, 3].map((i) => ({ name: `Regalo ${n}-${i}`, description: '', url: '' }));

test('guardar las preferencias de una persona no invalida los enlaces de las demás', async (t) => {
  const ctx = await setup();
  t.after(ctx.close);

  const created = await ctx.api('POST', '/groups', { body: groupPayload() });
  assert.equal(created.status, 201);
  const { groupId } = created.body;
  await waitFor(() => ctx.outbox.filter((m) => m.subject.includes('invitado')).length === 4);

  const tokens = Object.fromEntries(ctx.outbox.filter((m) => m.subject.includes('invitado')).map((m) => [m.to, tokenFrom(m)]));
  const names = { 'maria@example.com': 'María', 'luis@example.com': 'Luis', 'eva@example.com': 'Eva' };
  const saved = await ctx.api('PUT', `/groups/${groupId}/me/preferences`, {
    token: tokens['pedro@example.com'],
    body: { items: items('pedro') },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.drawDone, false);

  for (const email of Object.keys(names)) {
    const session = await ctx.api('GET', `/groups/${groupId}/me`, { token: tokens[email] });
    assert.equal(session.status, 200);
    assert.equal(session.body.participant.name, names[email]);
    assert.equal(session.body.preferences, null);
    assert.equal(session.body.canEdit, true);
  }
});

test('flujo completo: crear, invitar, preferencias, sorteo, resultados y borrado', async (t) => {
  const ctx = await setup();
  t.after(ctx.close);

  const created = await ctx.api('POST', '/groups', { body: groupPayload() });
  assert.equal(created.status, 201);
  const { groupId, adminToken } = created.body;

  await waitFor(() => ctx.outbox.length === 5); // bienvenida + 4 invitaciones
  const invitations = ctx.outbox.filter((m) => m.subject.includes('invitado'));
  assert.equal(invitations.length, 4);

  // Los tokens no se guardan en claro.
  const raw = await fs.readFile(path.join(ctx.dataDir, 'Groups', groupId, 'invitations.json'), 'utf8');
  for (const inv of invitations) assert.ok(!raw.includes(tokenFrom(inv)));

  let admin;
  await waitFor(async () => {
    admin = await ctx.api('GET', `/groups/${groupId}/admin`, { token: adminToken });
    return admin.body.participants.every((p) => p.invitation.status === 'sent');
  });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.summary.pending, 4);

  // Token incorrecto => sin acceso.
  assert.equal((await ctx.api('GET', `/groups/${groupId}/admin`, { token: 'x'.repeat(43) })).status, 401);
  assert.equal((await ctx.api('GET', `/groups/${groupId}/me`, { token: 'x'.repeat(43) })).status, 404);

  const tokens = Object.fromEntries(invitations.map((m) => [m.to, tokenFrom(m)]));
  const session = await ctx.api('GET', `/groups/${groupId}/me`, { token: tokens['pedro@example.com'] });
  assert.equal(session.body.participant.name, 'Pedro');
  assert.equal(session.body.group.budgetMin, 15);
  assert.equal(session.body.group.budgetMax, 30);

  // Validación: deben ser 3 regalos.
  const bad = await ctx.api('PUT', `/groups/${groupId}/me/preferences`, {
    token: tokens['pedro@example.com'],
    body: { items: items('x').slice(0, 2) },
  });
  assert.equal(bad.status, 400);

  // Todos guardan a la vez: el sorteo debe ejecutarse una única vez.
  ctx.outbox.length = 0;
  const saves = await Promise.all(
    Object.entries(tokens).map(([email, token]) =>
      ctx.api('PUT', `/groups/${groupId}/me/preferences`, { token, body: { items: items(email) } }),
    ),
  );
  assert.ok(saves.every((s) => s.status === 200));

  // 4 resultados + aviso de completado al organizador.
  await waitFor(() => ctx.outbox.length === 5);
  const results = ctx.outbox.filter((m) => m.subject.includes('Ya tienes'));
  assert.equal(results.length, 4);
  const pedro = results.find((m) => m.to === 'pedro@example.com');
  assert.ok(!pedro.text.includes('Te ha tocado regalar a María'));
  assert.ok(!pedro.text.includes('Te ha tocado regalar a Pedro'));
  assert.match(pedro.text, /Presupuesto: de 15\s€ a 30\s€/);

  // Datos eliminados al completarse; queda un marcador sin datos personales.
  await waitFor(async () => !(await ctx.store.exists(groupId)));
  const after = await ctx.api('GET', `/groups/${groupId}/admin`, { token: adminToken });
  assert.equal(after.body.completed, true);
  const tombstone = await fs.readFile(path.join(ctx.dataDir, 'Completed', `${groupId}.json`), 'utf8');
  assert.ok(!tombstone.includes('example.com') && !tombstone.includes('Pedro'));
  const participantAfter = await ctx.api('GET', `/groups/${groupId}/me`, { token: tokens['luis@example.com'] });
  assert.equal(participantAfter.body.code, 'group_completed');
});

test('rechaza correos duplicados y restricciones imposibles', async (t) => {
  const ctx = await setup();
  t.after(ctx.close);

  const dup = groupPayload();
  dup.participants[1].email = 'PEDRO@example.com';
  const r1 = await ctx.api('POST', '/groups', { body: dup });
  assert.equal(r1.status, 400);
  assert.ok(r1.body.details.some((d) => d.path === 'participants.1.email'));

  const impossible = groupPayload();
  impossible.participants[2].exclusions = ['a', 'b', 'd'];
  const r2 = await ctx.api('POST', '/groups', { body: impossible });
  assert.equal(r2.status, 400);
  assert.match(r2.body.message, /Luis no tiene a nadie/);
});

test('reenviar invitación invalida el enlace anterior', async (t) => {
  const ctx = await setup();
  t.after(ctx.close);
  const { groupId, adminToken } = (await ctx.api('POST', '/groups', { body: groupPayload() })).body;
  await waitFor(() => ctx.outbox.length === 5);
  const old = tokenFrom(ctx.outbox.find((m) => m.to === 'luis@example.com'));

  let admin;
  await waitFor(async () => {
    admin = await ctx.api('GET', `/groups/${groupId}/admin`, { token: adminToken });
    return admin.body.participants.every((p) => p.invitation.status === 'sent');
  });
  const luis = admin.body.participants.find((p) => p.name === 'Luis');
  ctx.outbox.length = 0;
  const resend = await ctx.api('POST', `/groups/${groupId}/admin/invitations/resend`, {
    token: adminToken,
    body: { participantIds: [luis.id] },
  });
  assert.deepEqual(resend.body.queued, [luis.id]);
  await waitFor(() => ctx.outbox.length === 1);
  const fresh = tokenFrom(ctx.outbox[0]);

  assert.equal((await ctx.api('GET', `/groups/${groupId}/me`, { token: old })).status, 404);
  assert.equal((await ctx.api('GET', `/groups/${groupId}/me`, { token: fresh })).status, 200);
});

test('enlaces caducados devuelven 410', async (t) => {
  const ctx = await setup();
  t.after(ctx.close);
  const { groupId } = (await ctx.api('POST', '/groups', { body: groupPayload() })).body;
  await waitFor(() => ctx.outbox.length === 5);
  const token = tokenFrom(ctx.outbox.find((m) => m.to === 'eva@example.com'));

  await ctx.store.withLock(groupId, async () => {
    const inv = await ctx.store.read(groupId, 'invitations');
    for (const i of Object.values(inv.byParticipant)) i.expiresAt = new Date(Date.now() - 1000).toISOString();
    await ctx.store.write(groupId, 'invitations', inv);
  });
  const res = await ctx.api('GET', `/groups/${groupId}/me`, { token });
  assert.equal(res.status, 410);
  assert.equal(res.body.code, 'expired_link');
});

test('los correos fallidos se registran y se reintentan sin repetir el sorteo', async (t) => {
  const ctx = await setup();
  t.after(ctx.close);
  const { groupId, adminToken } = (await ctx.api('POST', '/groups', { body: groupPayload() })).body;
  await waitFor(() => ctx.outbox.length === 5);
  const tokens = Object.fromEntries(ctx.outbox.filter((m) => m.subject.includes('invitado')).map((m) => [m.to, tokenFrom(m)]));

  ctx.failFor.add('eva@example.com');
  ctx.outbox.length = 0;
  for (const [email, token] of Object.entries(tokens)) {
    await ctx.api('PUT', `/groups/${groupId}/me/preferences`, { token, body: { items: items(email) } });
  }
  await waitFor(() => ctx.outbox.length === 3);
  const drawBefore = await fs.readFile(path.join(ctx.dataDir, 'Groups', groupId, 'draw.json'), 'utf8');
  await waitFor(async () => {
    const view = await ctx.api('GET', `/groups/${groupId}/admin`, { token: adminToken });
    return view.body.participants.find((p) => p.email === 'eva@example.com').resultEmail.status === 'failed';
  });

  ctx.failFor.delete('eva@example.com');
  const retry = await ctx.api('POST', `/groups/${groupId}/admin/results/retry`, { token: adminToken });
  assert.equal(retry.status, 202);
  await waitFor(() => ctx.outbox.some((m) => m.to === 'eva@example.com'));
  // Solo se reenvía a Eva; el resto no recibe duplicados.
  assert.equal(ctx.outbox.filter((m) => m.subject.includes('Ya tienes')).length, 4);
  assert.ok(!drawBefore.includes('assignments'), 'el resultado se guarda cifrado');
});
