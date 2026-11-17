const DAY_MS = 86400000;

/**
 * Tareas de mantenimiento:
 *  - Recuperación al arrancar: completa los envíos y sorteos que quedaron a
 *    medias si el proceso se detuvo (reinicio, actualización del contenedor...).
 *  - Conservación: elimina automáticamente grupos, marcadores y copias antiguas.
 *  - Reintento periódico de correos de resultado fallidos.
 */
export function createMaintenanceService({ config, store, crypto, dispatcher, drawService, groupService, logger }) {
  const retentionMs = config.groupRetentionDays * DAY_MS;
  const autoRetryLimit = config.email.maxAttempts * 3;

  async function recoverGroup(groupId) {
    const docs = await store.readMany(groupId, ['group', 'invitations', 'emailStatus']);
    if (!docs.group) return;
    const { group } = docs;

    if (!docs.emailStatus?.organizer?.welcome) {
      // El organizador nunca recibió su enlace (el token en claro se perdió): se emite uno nuevo.
      const adminToken = crypto.generateToken();
      await store.withLock(groupId, async () => {
        const current = await store.read(groupId, 'group');
        current.adminTokenHash = crypto.hashToken(adminToken);
        await store.write(groupId, 'group', current);
      });
      await dispatcher.sendOrganizerWelcome(groupId, adminToken);
    }

    if (group.status === 'collecting' || group.status === 'draw_failed') {
      const interrupted = Object.entries(docs.invitations.byParticipant)
        .filter(([, inv]) => inv.status === 'pending' || inv.status === 'sending')
        .map(([id]) => id);
      if (interrupted.length > 0) {
        logger.info({ groupId, count: interrupted.length }, 'Reanudando invitaciones interrumpidas');
        await dispatcher.issueInvitations(groupId, interrupted);
      }
      const outcome = await store.withLock(groupId, () => drawService.drawIfReadyLocked(groupId));
      groupService.handleDrawOutcome(groupId, outcome === 'failed_again' ? 'none' : outcome);
    } else if (group.status === 'drawn') {
      logger.info({ groupId }, 'Reanudando envío de resultados');
      await dispatcher.dispatchResults(groupId);
    }
  }

  async function recoverAll() {
    for (const groupId of await store.listGroupIds()) {
      try {
        await recoverGroup(groupId);
      } catch (err) {
        logger.error({ groupId, err }, 'Error al recuperar el grupo');
      }
    }
  }

  async function applyRetention() {
    const now = Date.now();
    let removed = 0;
    for (const groupId of await store.listGroupIds()) {
      try {
        const group = await store.read(groupId, 'group');
        const createdAt = Date.parse(group?.createdAt ?? '');
        if (!group || (Number.isFinite(createdAt) && now - createdAt > retentionMs)) {
          await store.withLock(groupId, () => store.remove(groupId));
          removed++;
        }
      } catch (err) {
        logger.error({ groupId, err }, 'Error aplicando la política de conservación');
      }
    }
    for (const groupId of await store.listTombstones()) {
      const tombstone = await store.readTombstone(groupId);
      const completedAt = Date.parse(tombstone?.completedAt ?? '');
      if (!tombstone || (Number.isFinite(completedAt) && now - completedAt > retentionMs)) {
        await store.removeTombstone(groupId);
      }
    }
    const live = new Set(await store.listGroupIds());
    for (const groupId of await store.listBackupGroupIds()) {
      if (!live.has(groupId)) await store.removeBackups(groupId);
    }
    if (removed > 0) logger.info({ removed }, 'Grupos antiguos eliminados por la política de conservación');
  }

  async function retryFailedResults() {
    for (const groupId of await store.listGroupIds()) {
      try {
        const { group, emailStatus } = await store.readMany(groupId, ['group', 'emailStatus']);
        if (group?.status !== 'drawn') continue;
        const retryable = Object.values(emailStatus?.results ?? {}).some(
          (r) => r.status === 'failed' && (r.attempts ?? 0) < autoRetryLimit,
        );
        if (retryable) await dispatcher.dispatchResults(groupId, { retryFailed: true });
      } catch (err) {
        logger.error({ groupId, err }, 'Error al reintentar resultados');
      }
    }
  }

  let timer;
  function start({ intervalMs = 60 * 60 * 1000 } = {}) {
    const run = async () => {
      await applyRetention().catch((err) => logger.error({ err }, 'Error en la tarea de conservación'));
      await retryFailedResults().catch((err) => logger.error({ err }, 'Error en el reintento de correos'));
    };
    recoverAll()
      .then(run)
      .catch((err) => logger.error({ err }, 'Error en la recuperación inicial'));
    timer = setInterval(run, intervalMs);
    timer.unref();
  }

  function stop() {
    clearInterval(timer);
  }

  return { start, stop, recoverAll, applyRetention, retryFailedResults };
}
