import express from 'express';
import rateLimit from 'express-rate-limit';
import { errors } from '../errors.js';
import { isValidGroupId } from '../storage/groupStore.js';
import { CURRENCIES } from '../validation.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(header);
  return match ? match[1] : null;
}

function limiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(errors.tooManyRequests(message)),
  });
}

export function createApiRouter({ config, services }) {
  const { groupService, participantService } = services;
  const router = express.Router();

  router.use(limiter(15 * 60 * 1000, config.rateLimits.apiPer15Min));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.param('groupId', (req, res, next, groupId) => {
    if (!isValidGroupId(groupId)) return next(errors.invalidLink());
    next();
  });

  const createGroupLimiter = limiter(
    60 * 60 * 1000,
    config.rateLimits.createGroupPerHour,
    'Has creado demasiados grupos en poco tiempo. Inténtalo de nuevo en una hora.',
  );
  const resendLimiter = limiter(
    60 * 60 * 1000,
    config.rateLimits.resendPerHour,
    'Has reenviado demasiadas invitaciones. Inténtalo de nuevo más tarde.',
  );

  router.get('/config', (req, res) => {
    res.json({
      maxParticipants: config.maxParticipants,
      invitationTtlHours: config.invitationTtlHours,
      currencies: CURRENCIES,
      groupRetentionDays: config.groupRetentionDays,
    });
  });

  // --- Organizador ---

  router.post(
    '/groups',
    createGroupLimiter,
    asyncHandler(async (req, res) => {
      const { groupId, adminToken } = await groupService.createGroup(req.body);
      res.status(201).json({ groupId, adminUrl: `${config.appBaseUrl}/organizador/${groupId}#${adminToken}`, adminToken });
    }),
  );

  router.get(
    '/groups/:groupId/admin',
    asyncHandler(async (req, res) => {
      res.json(await groupService.getAdminView(req.params.groupId, bearerToken(req)));
    }),
  );

  router.post(
    '/groups/:groupId/admin/invitations/resend',
    resendLimiter,
    asyncHandler(async (req, res) => {
      res.status(202).json(await groupService.resendInvitations(req.params.groupId, bearerToken(req), req.body));
    }),
  );

  router.post(
    '/groups/:groupId/admin/results/retry',
    resendLimiter,
    asyncHandler(async (req, res) => {
      res.status(202).json(await groupService.retryResultEmails(req.params.groupId, bearerToken(req)));
    }),
  );

  router.put(
    '/groups/:groupId/admin/restrictions',
    asyncHandler(async (req, res) => {
      res.json(await groupService.updateRestrictions(req.params.groupId, bearerToken(req), req.body));
    }),
  );

  router.delete(
    '/groups/:groupId/admin',
    asyncHandler(async (req, res) => {
      res.json(await groupService.deleteGroup(req.params.groupId, bearerToken(req)));
    }),
  );

  // --- Participante ---

  router.get(
    '/groups/:groupId/me',
    asyncHandler(async (req, res) => {
      res.json(await participantService.getSession(req.params.groupId, bearerToken(req)));
    }),
  );

  router.put(
    '/groups/:groupId/me/preferences',
    asyncHandler(async (req, res) => {
      res.json(await participantService.savePreferences(req.params.groupId, bearerToken(req), req.body));
    }),
  );

  router.use((req, res, next) => next(errors.invalidLink()));
  return router;
}
