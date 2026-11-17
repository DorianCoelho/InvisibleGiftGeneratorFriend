import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDraw, drawAssignments, isValidAssignment } from '@amigo-invisible/shared/draw';

const people = (n, exclusions = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, exclusions: exclusions[`p${i}`] ?? [] }));

test('el sorteo nunca asigna a uno mismo y es una permutación válida', () => {
  for (let n = 3; n <= 30; n++) {
    const participants = people(n);
    for (let run = 0; run < 20; run++) {
      const result = drawAssignments(participants);
      assert.ok(result, `debe haber solución para ${n}`);
      assert.ok(isValidAssignment(participants, result));
      for (const a of result) assert.notEqual(a.giverId, a.receiverId);
    }
  }
});

test('respeta las restricciones (parejas que no se regalan)', () => {
  const participants = people(6, { p0: ['p1'], p1: ['p0'], p2: ['p3'], p3: ['p2'] });
  for (let run = 0; run < 200; run++) {
    const result = drawAssignments(participants);
    assert.ok(isValidAssignment(participants, result));
    const map = Object.fromEntries(result.map((a) => [a.giverId, a.receiverId]));
    assert.notEqual(map.p0, 'p1');
    assert.notEqual(map.p1, 'p0');
    assert.notEqual(map.p2, 'p3');
    assert.notEqual(map.p3, 'p2');
  }
});

test('detecta sorteos imposibles', () => {
  // p0 no puede regalar a nadie.
  const blocked = people(3, { p0: ['p1', 'p2'] });
  assert.deepEqual(analyzeDraw(blocked), { possible: false, blockedIds: ['p0'] });
  assert.equal(drawAssignments(blocked), null);

  // Todos solo pueden regalar a p0: nadie bloqueado individualmente, pero imposible en conjunto.
  const funnel = people(4, { p1: ['p2', 'p3'], p2: ['p1', 'p3'], p3: ['p1', 'p2'] });
  assert.equal(analyzeDraw(funnel).possible, false);
  assert.equal(drawAssignments(funnel), null);
});

test('encuentra la única solución cuando las restricciones solo permiten una', () => {
  // Solo es posible el ciclo p0 -> p1 -> p2 -> p3 -> p0.
  const participants = people(4, { p0: ['p2', 'p3'], p1: ['p0', 'p3'], p2: ['p0', 'p1'], p3: ['p1', 'p2'] });
  for (let run = 0; run < 50; run++) {
    const result = drawAssignments(participants);
    assert.deepEqual(
      Object.fromEntries(result.map((a) => [a.giverId, a.receiverId])),
      { p0: 'p1', p1: 'p2', p2: 'p3', p3: 'p0' },
    );
  }
});

test('la asignación es aleatoria (todas las combinaciones posibles aparecen)', () => {
  const participants = people(4);
  const seen = new Set();
  for (let run = 0; run < 2000; run++) {
    seen.add(drawAssignments(participants).map((a) => a.receiverId).join(','));
  }
  assert.equal(seen.size, 9); // Hay 9 desarreglos de 4 elementos.
});

test('requiere al menos 3 participantes', () => {
  assert.equal(analyzeDraw(people(2)).possible, false);
});
