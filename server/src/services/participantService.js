import { AppError, errors } from '../errors.js';
import { parse, preferencesSchema } from '../validation.js';

const EDITABLE_STATUSES = ['collecting', 'draw_failed'];

/** Casos de uso del participante: ver su invitación y guardar sus preferencias. */
export function createParticipantService({ store, crypto, drawService, groupService, logger }) {
  /**
   * Identifica al participante por su token. Recorre todas las invitaciones
   * del grupo comparando hashes en tiempo constante.
   */
  function findParticipantId(invitations, token) {
    let found = null;
    for (const [participantId, inv] of Object.entries(invitations.byParticipant)) {
      if (inv.tokenHash && crypto.tokenMatches(token, inv.tokenHash)) found = participantId;
    }
    return found;
  }

  async function authenticate(groupId, token) {
    if (!token) throw errors.invalidLink();
    const docs = await store.readMany(groupId, ['group', 'participants', 'invitations']).catch(() => null);

    if (!docs?.group) {
      const tombstone = await store.readTombstone(groupId);
      if (tombstone?.participantTokenHashes?.some((h) => crypto.tokenMatches(token, h))) {
        throw new AppError(410, 'group_completed', 'El sorteo de este grupo ya terminó. Revisa tu correo para ver a quién te ha tocado.');
      }
      throw errors.invalidLink();
    }

    const participantId = findParticipantId(docs.invitations, token);
    if (!participantId) throw errors.invalidLink();

    const invitation = docs.invitations.byParticipant[participantId];
    if (Date.parse(invitation.expiresAt) < Date.now()) {
      if (!EDITABLE_STATUSES.includes(docs.group.status)) {
        throw new AppError(410, 'already_drawn', 'El sorteo ya se ha realizado. Revisa tu correo para ver a quién te ha tocado.');
      }
      throw errors.expiredLink();
    }
    const participant = docs.participants.participants.find((p) => p.id === participantId);
    return { group: docs.group, participant, invitation };
  }

  async function getSession(groupId, token) {
    const { group, participant, invitation } = await authenticate(groupId, token);
    const preferences = await store.read(groupId, 'preferences');
    const own = preferences.byParticipant[participant.id] ?? null;
    const completed = Object.keys(preferences.byParticipant).length;
    const drawDone = !EDITABLE_STATUSES.includes(group.status);

    return {
      participant: { name: participant.name },
      group: {
        name: group.name,
        budget: group.budget,
        currency: group.currency,
        exchangeDate: group.exchangeDate,
        organizerName: group.organizer.name,
      },
      preferences: own,
      link: { expiresAt: invitation.expiresAt },
      progress: { completed, total: group.participantCount },
      drawDone,
      canEdit: !drawDone,
    };
  }

  async function savePreferences(groupId, token, body) {
    const { items } = parse(preferencesSchema, body);

    const result = await store.withLock(groupId, async () => {
      // Se vuelve a autenticar dentro del candado: el enlace pudo reemitirse o el sorteo realizarse.
      const { group, participant } = await authenticate(groupId, token);
      if (!EDITABLE_STATUSES.includes(group.status) || (await store.read(groupId, 'draw'))) {
        throw errors.conflict('draw_done', 'El sorteo ya se ha realizado; ya no puedes cambiar tus preferencias.');
      }
      const preferences = await store.read(groupId, 'preferences');
      const isUpdate = Boolean(preferences.byParticipant[participant.id]);
      preferences.byParticipant[participant.id] = { items, updatedAt: new Date().toISOString() };
      await store.write(groupId, 'preferences', preferences);

      const drawStatus = await drawService.drawIfReadyLocked(groupId);
      return {
        participantId: participant.id,
        isUpdate,
        drawStatus,
        progress: { completed: Object.keys(preferences.byParticipant).length, total: group.participantCount },
      };
    });

    logger.info({ groupId, participantId: result.participantId, update: result.isUpdate }, 'Preferencias guardadas');
    groupService.handleDrawOutcome(groupId, result.drawStatus);
    return {
      saved: true,
      drawDone: result.drawStatus === 'drawn' || result.drawStatus === 'already_drawn',
      progress: result.progress,
    };
  }

  return { getSession, savePreferences };
}
