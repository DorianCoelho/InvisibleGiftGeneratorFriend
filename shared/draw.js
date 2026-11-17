// Algoritmo del sorteo compartido entre servidor y cliente.
//
// El sorteo se modela como un emparejamiento perfecto en un grafo bipartito
// (quien regala -> quien recibe). Una arista existe si el receptor no es la
// misma persona y no está en las exclusiones de quien regala. Existe un sorteo
// válido si y solo si existe un emparejamiento perfecto, lo que comprobamos con
// el algoritmo de Kuhn (caminos aumentantes), en tiempo polinómico.

/**
 * @typedef {{ id: string, exclusions?: string[] }} DrawParticipant
 * @typedef {{ giverId: string, receiverId: string }} Assignment
 */

/** Entero aleatorio uniforme en [0, max) usando el CSPRNG disponible. */
export function secureRandomInt(max) {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError('max debe ser un entero positivo');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let value;
  do {
    globalThis.crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

function shuffle(items, randomInt) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** @param {DrawParticipant[]} participants */
export function buildAllowedReceivers(participants) {
  const ids = participants.map((p) => p.id);
  const allowed = new Map();
  for (const p of participants) {
    const excluded = new Set(p.exclusions ?? []);
    allowed.set(p.id, ids.filter((id) => id !== p.id && !excluded.has(id)));
  }
  return allowed;
}

function hasPerfectMatching(givers, receivers, allowed) {
  if (givers.length !== receivers.size) return false;
  const giverOfReceiver = new Map();
  const augment = (giver, visited) => {
    for (const receiver of allowed.get(giver)) {
      if (!receivers.has(receiver) || visited.has(receiver)) continue;
      visited.add(receiver);
      const current = giverOfReceiver.get(receiver);
      if (current === undefined || augment(current, visited)) {
        giverOfReceiver.set(receiver, giver);
        return true;
      }
    }
    return false;
  };
  return givers.every((giver) => augment(giver, new Set()));
}

/**
 * Analiza si las restricciones permiten realizar el sorteo.
 * @param {DrawParticipant[]} participants
 * @returns {{ possible: boolean, blockedIds: string[] }}
 *   blockedIds: participantes sin ninguna persona posible a la que regalar.
 */
export function analyzeDraw(participants) {
  if (participants.length < 3) return { possible: false, blockedIds: [] };
  const allowed = buildAllowedReceivers(participants);
  const ids = participants.map((p) => p.id);
  const blockedIds = ids.filter((id) => allowed.get(id).length === 0);
  const possible = blockedIds.length === 0 && hasPerfectMatching(ids, new Set(ids), allowed);
  return { possible, blockedIds };
}

/**
 * Realiza el sorteo aleatorio respetando todas las restricciones.
 * Se elige al azar el receptor de cada persona (en orden aleatorio) descartando
 * cualquier elección que impida completar el resto del sorteo, por lo que
 * siempre encuentra solución cuando existe.
 *
 * @param {DrawParticipant[]} participants
 * @param {(max: number) => number} [randomInt]
 * @returns {Assignment[] | null} null si no existe ninguna combinación válida.
 */
export function drawAssignments(participants, randomInt = secureRandomInt) {
  if (!analyzeDraw(participants).possible) return null;

  const allowed = buildAllowedReceivers(participants);
  const givers = shuffle(participants.map((p) => p.id), randomInt);
  const remaining = new Set(givers);
  const result = new Map();

  for (let i = 0; i < givers.length; i++) {
    const giver = givers[i];
    const candidates = shuffle(allowed.get(giver).filter((r) => remaining.has(r)), randomInt);
    let chosen = null;
    for (const candidate of candidates) {
      remaining.delete(candidate);
      if (hasPerfectMatching(givers.slice(i + 1), remaining, allowed)) {
        chosen = candidate;
        break;
      }
      remaining.add(candidate);
    }
    if (chosen === null) return null;
    result.set(giver, chosen);
  }

  return participants.map((p) => ({ giverId: p.id, receiverId: result.get(p.id) }));
}

/** Comprueba que una asignación cumple todas las reglas del sorteo. */
export function isValidAssignment(participants, assignments) {
  const allowed = buildAllowedReceivers(participants);
  if (assignments.length !== participants.length) return false;
  const givers = new Set();
  const receivers = new Set();
  for (const { giverId, receiverId } of assignments) {
    if (!allowed.has(giverId) || !allowed.get(giverId).includes(receiverId)) return false;
    givers.add(giverId);
    receivers.add(receiverId);
  }
  return givers.size === participants.length && receivers.size === participants.length;
}
