import { describeEmailError } from '../email/emailSender.js';
import {
  invitationEmail,
  organizerCompletedEmail,
  organizerDrawFailedEmail,
  organizerWelcomeEmail,
  resultEmail,
} from '../email/templates.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

/**
 * Envía invitaciones y resultados registrando el estado de cada correo en
 * invitations.json / email-status.json. Cada envío se reintenta con espera
 * progresiva; los que fallan quedan como "failed" y se pueden reintentar más
 * tarde sin repetir el sorteo.
 */
export function createEmailDispatcher({ config, store, crypto, sender, logger }) {
  const activeResultDispatches = new Set();
  const queuedResultDispatches = new Map(); // groupId -> retryFailed
  const maxAttempts = config.email.maxAttempts;
  const retryDelayMs = config.nodeEnv === 'test' ? 0 : 2000;

  async function sendWithRetry(message, context) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await sender.send(message);
        return { ok: true, attempts: attempt };
      } catch (err) {
        lastError = describeEmailError(err);
        logger.warn({ ...context, attempt, error: lastError }, 'Fallo al enviar correo');
        if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
      }
    }
    return { ok: false, attempts: maxAttempts, error: lastError };
  }

  const participantLink = (groupId, token) => `${config.appBaseUrl}/preferencias/${groupId}/${token}`;
  const adminLink = (groupId, token) => `${config.appBaseUrl}/organizador/${groupId}#${token}`;

  // ---------------------------------------------------------------------------
  // Invitaciones
  // ---------------------------------------------------------------------------

  /**
   * Genera un enlace nuevo (invalidando el anterior) y envía la invitación.
   * @returns {Promise<'sent'|'failed'|'skipped'>}
   */
  async function issueInvitation(groupId, participantId) {
    const token = crypto.generateToken();
    const tokenHash = crypto.hashToken(token);

    const prepared = await store.withLock(groupId, async () => {
      const { group, participants, invitations } = await store.readMany(groupId, ['group', 'participants', 'invitations']);
      if (!group || !['collecting', 'draw_failed'].includes(group.status)) return null;
      const participant = participants.participants.find((p) => p.id === participantId);
      if (!participant) return null;
      const previous = invitations.byParticipant[participantId] ?? {};
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + config.invitationTtlHours * 3600 * 1000);
      invitations.byParticipant[participantId] = {
        tokenHash,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'sending',
        sentAt: null,
        sendCount: (previous.sendCount ?? 0) + 1,
        lastAttemptAt: issuedAt.toISOString(),
        lastError: null,
      };
      await store.write(groupId, 'invitations', invitations);
      return { group, participant, expiresAt: expiresAt.toISOString() };
    });
    if (!prepared) return 'skipped';

    const { group, participant, expiresAt } = prepared;
    const message = invitationEmail({
      participantName: participant.name,
      groupName: group.name,
      organizerName: group.organizer.name,
      budgetMin: group.budgetMin ?? group.budget,
      budgetMax: group.budgetMax ?? group.budget,
      currency: group.currency,
      exchangeDate: group.exchangeDate,
      link: participantLink(groupId, token),
      expiresAt,
    });
    const result = await sendWithRetry(
      { to: participant.email, toName: participant.name, ...message },
      { groupId, participantId, kind: 'invitation' },
    );

    await store.withLock(groupId, async () => {
      const invitations = await store.read(groupId, 'invitations');
      const current = invitations?.byParticipant[participantId];
      // Si mientras tanto se emitió otro enlace, ese envío manda.
      if (!current || current.tokenHash !== tokenHash) return;
      current.status = result.ok ? 'sent' : 'failed';
      current.sentAt = result.ok ? nowIso() : null;
      current.lastError = result.ok ? null : result.error;
      await store.write(groupId, 'invitations', invitations);
    });
    logger.info({ groupId, participantId, status: result.ok ? 'sent' : 'failed' }, 'Invitación procesada');
    return result.ok ? 'sent' : 'failed';
  }

  async function issueInvitations(groupId, participantIds) {
    const results = {};
    for (const id of participantIds) {
      try {
        results[id] = await issueInvitation(groupId, id);
      } catch (err) {
        logger.error({ groupId, participantId: id, err }, 'Error inesperado al emitir la invitación');
        results[id] = 'failed';
      }
    }
    return results;
  }

  async function sendOrganizerWelcome(groupId, adminToken) {
    const group = await store.read(groupId, 'group');
    if (!group) return;
    const message = organizerWelcomeEmail({
      organizerName: group.organizer.name,
      groupName: group.name,
      adminLink: adminLink(groupId, adminToken),
      participantCount: group.participantCount,
    });
    const result = await sendWithRetry(
      { to: group.organizer.email, toName: group.organizer.name, ...message },
      { groupId, kind: 'organizer-welcome' },
    );
    await recordOrganizerEmail(groupId, 'welcome', result);
  }

  async function recordOrganizerEmail(groupId, kind, result) {
    await store.withLock(groupId, async () => {
      if (!(await store.exists(groupId))) return;
      const status = (await store.read(groupId, 'emailStatus')) ?? { results: {}, organizer: {} };
      status.organizer ??= {};
      status.organizer[kind] = {
        status: result.ok ? 'sent' : 'failed',
        at: nowIso(),
        lastError: result.ok ? null : result.error,
      };
      await store.write(groupId, 'emailStatus', status);
    });
  }

  async function notifyDrawFailed(groupId) {
    const group = await store.read(groupId, 'group');
    if (!group) return;
    const message = organizerDrawFailedEmail({ organizerName: group.organizer.name, groupName: group.name });
    const result = await sendWithRetry(
      { to: group.organizer.email, toName: group.organizer.name, ...message },
      { groupId, kind: 'organizer-draw-failed' },
    );
    await recordOrganizerEmail(groupId, 'drawFailed', result);
  }

  // ---------------------------------------------------------------------------
  // Resultados del sorteo
  // ---------------------------------------------------------------------------

  /**
   * Envía el resultado a cada participante cuyo correo aún no se ha entregado.
   * Nunca vuelve a sortear: lee el resultado guardado en draw.json.
   * @param {{ retryFailed?: boolean }} options retryFailed: reintenta también los fallidos definitivos.
   */
  async function dispatchResults(groupId, { retryFailed = false } = {}) {
    if (activeResultDispatches.has(groupId)) {
      // Ya hay un envío en curso: se repetirá al terminar para no perder la petición.
      queuedResultDispatches.set(groupId, retryFailed || queuedResultDispatches.get(groupId) === true);
      return { queued: true };
    }
    activeResultDispatches.add(groupId);
    try {
      const docs = await store.readMany(groupId, ['group', 'participants', 'preferences', 'draw', 'emailStatus']);
      if (!docs.group || !docs.draw || !['drawn', 'completed'].includes(docs.group.status)) return { skipped: true };

      const { assignments } = crypto.decryptJson(docs.draw.encrypted);
      const byId = new Map(docs.participants.participants.map((p) => [p.id, p]));

      for (const { giverId, receiverId } of assignments) {
        const current = docs.emailStatus?.results?.[giverId];
        if (current?.status === 'sent') continue;
        if (current?.status === 'failed' && !retryFailed) continue;

        const giver = byId.get(giverId);
        const receiver = byId.get(receiverId);
        const message = resultEmail({
          giverName: giver.name,
          groupName: docs.group.name,
          receiverName: receiver.name,
          budgetMin: docs.group.budgetMin ?? docs.group.budget,
          budgetMax: docs.group.budgetMax ?? docs.group.budget,
          currency: docs.group.currency,
          items: docs.preferences.byParticipant[receiverId]?.items ?? [],
          exchangeDate: docs.group.exchangeDate,
        });

        await updateResultStatus(groupId, giverId, (s) => ({ ...s, status: 'sending', lastAttemptAt: nowIso() }));
        const result = await sendWithRetry(
          { to: giver.email, toName: giver.name, ...message },
          { groupId, participantId: giverId, kind: 'result' },
        );
        await updateResultStatus(groupId, giverId, (s) => ({
          ...s,
          status: result.ok ? 'sent' : 'failed',
          attempts: (s.attempts ?? 0) + result.attempts,
          sentAt: result.ok ? nowIso() : null,
          lastError: result.ok ? null : result.error,
        }));
      }

      return await finalizeIfComplete(groupId);
    } catch (err) {
      logger.error({ groupId, err }, 'Error al enviar los resultados del sorteo');
      return { error: true };
    } finally {
      activeResultDispatches.delete(groupId);
      if (queuedResultDispatches.has(groupId)) {
        const queuedRetryFailed = queuedResultDispatches.get(groupId);
        queuedResultDispatches.delete(groupId);
        dispatchResults(groupId, { retryFailed: queuedRetryFailed }).catch(() => {});
      }
    }
  }

  async function updateResultStatus(groupId, participantId, update) {
    await store.withLock(groupId, async () => {
      const status = (await store.read(groupId, 'emailStatus')) ?? { results: {}, organizer: {} };
      status.results[participantId] = update(status.results[participantId] ?? { attempts: 0 });
      await store.write(groupId, 'emailStatus', status);
    });
  }

  /**
   * Cuando todos los participantes han recibido su resultado se marca el grupo
   * como completado y, si así está configurado, se eliminan sus datos dejando
   * solo un marcador sin información personal.
   */
  async function finalizeIfComplete(groupId) {
    const outcome = await store.withLock(groupId, async () => {
      const docs = await store.readMany(groupId, ['group', 'participants', 'emailStatus']);
      if (!docs.group || docs.group.status !== 'drawn') return null;
      const allSent = docs.participants.participants.every((p) => docs.emailStatus?.results?.[p.id]?.status === 'sent');
      if (!allSent) return null;

      const completedAt = nowIso();
      const organizer = { ...docs.group.organizer };
      const summary = { groupName: docs.group.name, participantCount: docs.group.participantCount };

      if (config.deleteGroupWhenCompleted) {
        await store.writeTombstone(groupId, {
          schemaVersion: 1,
          groupId,
          adminTokenHash: docs.group.adminTokenHash,
          participantTokenHashes: Object.values((await store.read(groupId, 'invitations'))?.byParticipant ?? {})
            .map((i) => i.tokenHash)
            .filter(Boolean),
          participantCount: docs.group.participantCount,
          createdAt: docs.group.createdAt,
          completedAt,
        });
        await store.remove(groupId);
      } else {
        docs.group.status = 'completed';
        docs.group.completedAt = completedAt;
        docs.group.updatedAt = completedAt;
        await store.write(groupId, 'group', docs.group);
        await store.backup(groupId, 'completed');
      }
      return { organizer, summary };
    });
    if (!outcome) return { completed: false };

    logger.info({ groupId, deleted: config.deleteGroupWhenCompleted }, 'Grupo completado');
    const message = organizerCompletedEmail({
      organizerName: outcome.organizer.name,
      groupName: outcome.summary.groupName,
      participantCount: outcome.summary.participantCount,
      dataDeleted: config.deleteGroupWhenCompleted,
    });
    await sendWithRetry(
      { to: outcome.organizer.email, toName: outcome.organizer.name, ...message },
      { groupId, kind: 'organizer-completed' },
    );
    return { completed: true };
  }

  return {
    issueInvitation,
    issueInvitations,
    sendOrganizerWelcome,
    notifyDrawFailed,
    dispatchResults,
    isDispatching: (groupId) => activeResultDispatches.has(groupId),
  };
}
