import { drawAssignments, isValidAssignment } from '@amigo-invisible/shared/draw';

const nowIso = () => new Date().toISOString();

/**
 * Realiza el sorteo cuando todos los participantes han completado sus
 * preferencias. DEBE llamarse con el candado del grupo adquirido: así, aunque
 * varios participantes terminen a la vez, solo el primero sortea y los demás
 * encuentran draw.json ya creado.
 */
export function createDrawService({ store, crypto, logger }) {
  /** @returns {Promise<'waiting'|'drawn'|'already_drawn'|'failed'|'not_applicable'>} */
  async function drawIfReadyLocked(groupId) {
    const docs = await store.readMany(groupId, ['group', 'participants', 'preferences', 'draw', 'emailStatus']);
    const { group, participants, preferences } = docs;
    if (!group) return 'not_applicable';

    if (docs.draw) {
      // Recuperación: el sorteo se guardó pero el proceso se detuvo antes de actualizar el resto.
      if (group.status === 'collecting' || group.status === 'draw_failed') {
        await ensureEmailStatus(groupId, participants, docs.emailStatus);
        group.status = 'drawn';
        group.drawnAt ??= docs.draw.drawnAt;
        group.updatedAt = nowIso();
        await store.write(groupId, 'group', group);
        return 'drawn';
      }
      return 'already_drawn';
    }
    if (!['collecting', 'draw_failed'].includes(group.status)) return 'not_applicable';

    const allCompleted = participants.participants.every((p) => preferences.byParticipant[p.id]);
    if (!allCompleted) return 'waiting';

    const drawInput = participants.participants.map((p) => ({ id: p.id, exclusions: p.exclusions }));
    const assignments = drawAssignments(drawInput);

    if (!assignments || !isValidAssignment(drawInput, assignments)) {
      const firstFailure = group.status !== 'draw_failed';
      group.status = 'draw_failed';
      group.drawFailedAt = nowIso();
      group.updatedAt = group.drawFailedAt;
      await store.write(groupId, 'group', group);
      logger.warn({ groupId }, 'No existe ninguna combinación válida para el sorteo');
      return firstFailure ? 'failed' : 'failed_again';
    }

    await store.backup(groupId, 'before-draw');
    const drawnAt = nowIso();
    // 1) El resultado se guarda (cifrado) ANTES de enviar ningún correo.
    await store.write(groupId, 'draw', {
      schemaVersion: 1,
      drawnAt,
      encrypted: crypto.encryptJson({ assignments }),
    });
    // 2) Estado de envío de resultados: todos pendientes.
    await ensureEmailStatus(groupId, participants, docs.emailStatus);
    // 3) Estado del grupo.
    group.status = 'drawn';
    group.drawnAt = drawnAt;
    group.updatedAt = drawnAt;
    delete group.drawFailedAt;
    await store.write(groupId, 'group', group);
    await store.backup(groupId, 'after-draw');

    logger.info({ groupId, participants: assignments.length }, 'Sorteo realizado');
    return 'drawn';
  }

  async function ensureEmailStatus(groupId, participants, existing) {
    const status = existing ?? { results: {}, organizer: {} };
    status.results ??= {};
    for (const p of participants.participants) {
      status.results[p.id] ??= { status: 'pending', attempts: 0, sentAt: null, lastError: null };
    }
    await store.write(groupId, 'emailStatus', status);
  }

  return { drawIfReadyLocked };
}
