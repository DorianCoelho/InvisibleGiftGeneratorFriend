import { analyzeDraw } from '@amigo-invisible/shared/draw';
import { errors } from '../errors.js';
import { newId } from '../security/crypto.js';
import { createGroupSchema, parse, participantIdsSchema, restrictionsSchema } from '../validation.js';

const nowIso = () => new Date().toISOString();
const EDITABLE_STATUSES = ['collecting', 'draw_failed'];

/** Casos de uso del organizador: crear, consultar, reenviar, editar y eliminar grupos. */
export function createGroupService({ config, store, crypto, dispatcher, drawService, logger }) {
  const schema = createGroupSchema(config.maxParticipants);

  /** Lanza las tareas posteriores al sorteo (correos) sin bloquear la petición. */
  function handleDrawOutcome(groupId, outcome) {
    if (outcome === 'drawn') {
      dispatcher.dispatchResults(groupId).catch((err) => logger.error({ groupId, err }, 'Error al despachar resultados'));
    } else if (outcome === 'failed') {
      dispatcher.notifyDrawFailed(groupId).catch((err) => logger.error({ groupId, err }, 'Error al notificar sorteo fallido'));
    }
  }

  async function createGroup(input) {
    const data = parse(schema, input);
    const groupId = newId();
    const adminToken = crypto.generateToken();
    const createdAt = nowIso();

    const idByRef = new Map(data.participants.map((p) => [p.ref, newId()]));
    const participants = data.participants.map((p) => ({
      id: idByRef.get(p.ref),
      name: p.name,
      email: p.email,
      exclusions: [...new Set(p.exclusions)].map((ref) => idByRef.get(ref)),
    }));

    await store.create(groupId, {
      group: {
        schemaVersion: 1,
        id: groupId,
        name: data.name,
        budget: data.budget,
        currency: data.currency,
        exchangeDate: data.exchangeDate,
        organizer: data.organizer,
        participantCount: participants.length,
        adminTokenHash: crypto.hashToken(adminToken),
        status: 'collecting',
        createdAt,
        updatedAt: createdAt,
      },
      participants: { schemaVersion: 1, participants },
      preferences: { schemaVersion: 1, byParticipant: {} },
      invitations: {
        schemaVersion: 1,
        byParticipant: Object.fromEntries(
          participants.map((p) => [p.id, { tokenHash: null, status: 'pending', sendCount: 0, issuedAt: null, expiresAt: null }]),
        ),
      },
      emailStatus: { schemaVersion: 1, results: {}, organizer: {} },
    });
    logger.info({ groupId, participants: participants.length }, 'Grupo creado');

    // Los correos se envían en segundo plano; su estado se ve en el panel.
    (async () => {
      await dispatcher.sendOrganizerWelcome(groupId, adminToken);
      await dispatcher.issueInvitations(groupId, participants.map((p) => p.id));
    })().catch((err) => logger.error({ groupId, err }, 'Error al enviar los correos iniciales'));

    return { groupId, adminToken };
  }

  /**
   * Comprueba el token del organizador. Si el grupo ya terminó y sus datos se
   * eliminaron, devuelve el marcador de grupo completado.
   */
  async function authenticateAdmin(groupId, token) {
    if (!token) throw errors.unauthorized();
    const group = await store.read(groupId, 'group').catch(() => null);
    if (group) {
      if (!crypto.tokenMatches(token, group.adminTokenHash)) throw errors.unauthorized();
      return { group };
    }
    const tombstone = await store.readTombstone(groupId);
    if (tombstone && crypto.tokenMatches(token, tombstone.adminTokenHash)) return { tombstone };
    throw errors.invalidLink();
  }

  async function requireLiveGroup(groupId, token) {
    const auth = await authenticateAdmin(groupId, token);
    if (!auth.group) throw errors.conflict('group_completed', 'El grupo ya ha finalizado y sus datos se han eliminado.');
    return auth.group;
  }

  async function getAdminView(groupId, token) {
    const auth = await authenticateAdmin(groupId, token);
    if (auth.tombstone) {
      return {
        completed: true,
        dataDeleted: true,
        completedAt: auth.tombstone.completedAt,
        participantCount: auth.tombstone.participantCount,
      };
    }
    const docs = await store.readMany(groupId, ['group', 'participants', 'preferences', 'invitations', 'emailStatus', 'draw']);
    const { group } = docs;
    const now = Date.now();

    const participants = docs.participants.participants.map((p) => {
      const inv = docs.invitations.byParticipant[p.id] ?? {};
      const pref = docs.preferences.byParticipant[p.id];
      const result = docs.emailStatus?.results?.[p.id];
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        exclusions: p.exclusions,
        hasPreferences: Boolean(pref),
        preferencesUpdatedAt: pref?.updatedAt ?? null,
        invitation: {
          status: inv.status ?? 'pending',
          sentAt: inv.sentAt ?? null,
          issuedAt: inv.issuedAt ?? null,
          expiresAt: inv.expiresAt ?? null,
          expired: Boolean(inv.expiresAt && Date.parse(inv.expiresAt) < now),
          sendCount: inv.sendCount ?? 0,
          lastError: inv.lastError ?? null,
        },
        resultEmail: result ? { status: result.status, sentAt: result.sentAt ?? null, attempts: result.attempts ?? 0 } : null,
      };
    });
    const completed = participants.filter((p) => p.hasPreferences).length;

    return {
      completed: false,
      group: {
        id: group.id,
        name: group.name,
        budget: group.budget,
        currency: group.currency,
        exchangeDate: group.exchangeDate,
        organizer: group.organizer,
        status: group.status,
        createdAt: group.createdAt,
        drawnAt: group.drawnAt ?? null,
        drawFailedAt: group.drawFailedAt ?? null,
        deleteAfter: new Date(Date.parse(group.createdAt) + config.groupRetentionDays * 86400000).toISOString(),
      },
      summary: { total: participants.length, completed, pending: participants.length - completed },
      participants,
      canEditRestrictions: EDITABLE_STATUSES.includes(group.status) && !docs.draw,
      sendingResults: dispatcher.isDispatching(groupId),
      invitationTtlHours: config.invitationTtlHours,
      resendCooldownMinutes: config.resendCooldownMinutes,
      deleteGroupWhenCompleted: config.deleteGroupWhenCompleted,
    };
  }

  /** Reenvía invitaciones (por defecto a todos los pendientes) con enlaces nuevos. */
  async function resendInvitations(groupId, token, body) {
    const group = await requireLiveGroup(groupId, token);
    const { participantIds } = parse(participantIdsSchema, body ?? {});
    if (!EDITABLE_STATUSES.includes(group.status)) {
      throw errors.conflict('draw_done', 'El sorteo ya se ha realizado; no se pueden reenviar invitaciones.');
    }
    const docs = await store.readMany(groupId, ['participants', 'preferences', 'invitations']);
    const validIds = new Set(docs.participants.participants.map((p) => p.id));
    const targets = participantIds
      ? participantIds.filter((id) => validIds.has(id))
      : docs.participants.participants.filter((p) => !docs.preferences.byParticipant[p.id]).map((p) => p.id);

    const cooldownMs = config.resendCooldownMinutes * 60000;
    const now = Date.now();
    const toSend = [];
    const skipped = [];
    for (const id of targets) {
      const inv = docs.invitations.byParticipant[id];
      const recent = inv?.lastAttemptAt && now - Date.parse(inv.lastAttemptAt) < cooldownMs;
      if (recent || inv?.status === 'sending') skipped.push(id);
      else toSend.push(id);
    }

    dispatcher
      .issueInvitations(groupId, toSend)
      .catch((err) => logger.error({ groupId, err }, 'Error al reenviar invitaciones'));
    return { queued: toSend, skipped };
  }

  /** Reintenta los correos de resultado fallidos sin repetir el sorteo. */
  async function retryResultEmails(groupId, token) {
    const group = await requireLiveGroup(groupId, token);
    if (group.status !== 'drawn') throw errors.conflict('not_drawn', 'No hay correos de resultado pendientes.');
    dispatcher
      .dispatchResults(groupId, { retryFailed: true })
      .catch((err) => logger.error({ groupId, err }, 'Error al reintentar resultados'));
    return { started: true };
  }

  /** Permite corregir restricciones mientras el sorteo no se haya realizado. */
  async function updateRestrictions(groupId, token, body) {
    await requireLiveGroup(groupId, token);
    const { exclusions } = parse(restrictionsSchema, body);

    const outcome = await store.withLock(groupId, async () => {
      const docs = await store.readMany(groupId, ['group', 'participants', 'draw']);
      if (!EDITABLE_STATUSES.includes(docs.group.status) || docs.draw) {
        throw errors.conflict('draw_done', 'El sorteo ya se ha realizado; las restricciones no se pueden cambiar.');
      }
      const ids = new Set(docs.participants.participants.map((p) => p.id));
      const updated = docs.participants.participants.map((p) => ({
        ...p,
        exclusions: [...new Set((exclusions[p.id] ?? []).filter((id) => ids.has(id) && id !== p.id))],
      }));
      const analysis = analyzeDraw(updated);
      if (!analysis.possible) {
        const blocked = updated.filter((p) => analysis.blockedIds.includes(p.id)).map((p) => p.name);
        throw errors.validation(
          [],
          blocked.length
            ? `Con estas restricciones, ${blocked.join(', ')} no tiene a nadie a quien regalar.`
            : 'Con estas restricciones el sorteo es imposible.',
        );
      }
      await store.write(groupId, 'participants', { ...docs.participants, participants: updated });
      if (docs.group.status === 'draw_failed') {
        docs.group.status = 'collecting';
        docs.group.updatedAt = nowIso();
        await store.write(groupId, 'group', docs.group);
      }
      await store.backup(groupId, 'restrictions');
      return drawService.drawIfReadyLocked(groupId);
    });
    logger.info({ groupId, outcome }, 'Restricciones actualizadas');
    handleDrawOutcome(groupId, outcome);
    return { drawStatus: outcome };
  }

  /** Elimina el grupo y todos sus datos personales (incluidas las copias). */
  async function deleteGroup(groupId, token) {
    await authenticateAdmin(groupId, token);
    await store.withLock(groupId, async () => {
      await store.remove(groupId);
      await store.removeTombstone(groupId);
    });
    logger.info({ groupId }, 'Grupo eliminado por el organizador');
    return { deleted: true };
  }

  return {
    createGroup,
    getAdminView,
    resendInvitations,
    retryResultEmails,
    updateRestrictions,
    deleteGroup,
    handleDrawOutcome,
  };
}
