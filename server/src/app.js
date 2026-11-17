import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { AppError } from './errors.js';
import { createApiRouter } from './routes/api.js';

function parseTrustProxy(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function createApp({ config, services, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(config.trustProxy));

  // Log de peticiones: solo método, ruta (sin query) y estado. Nunca cuerpos ni cabeceras.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    const id = crypto.randomUUID().slice(0, 8);
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
      logger[level]({ id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) }, 'request');
    });
    next();
  });

  if (config.forceHttps) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.hostname}${req.originalUrl}`);
      res.status(403).json({ code: 'https_required', message: 'Se requiere HTTPS.' });
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.forceHttps ? [] : null,
        },
      },
      hsts: config.forceHttps ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.use('/api', express.json({ limit: '64kb' }), createApiRouter({ config, services }));

  // Frontend compilado (Vue). Los datos JSON viven en DATA_DIR, fuera de este directorio,
  // así que nunca se pueden servir al navegador.
  const indexHtml = path.join(config.clientDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.clientDistDir, {
        index: false,
        dotfiles: 'deny',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('*', (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (req, res) =>
      res.type('text').send('API en marcha. Ejecuta "npm run dev:client" para el frontend o "npm run build" para compilarlo.'),
    );
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ code: 'invalid_json', message: 'La petición no es válida.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ code: 'payload_too_large', message: 'La petición es demasiado grande.' });
    }
    logger.error({ err, path: req.path }, 'Error no controlado');
    res.status(500).json({ code: 'internal_error', message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.' });
  });

  return app;
}
