import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: process.env.ENV_FILE ?? path.join(repoRoot, '.env') });

function str(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value.trim();
}

function int(name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = str(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`La variable ${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function bool(name, fallback) {
  const raw = str(name);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(raw.toLowerCase());
}

const nodeEnv = str('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

const config = {
  nodeEnv,
  isProduction,
  port: int('PORT', 3000, { min: 1, max: 65535 }),
  appBaseUrl: str('APP_BASE_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  trustProxy: str('TRUST_PROXY', isProduction ? '1' : 'false'),
  forceHttps: bool('FORCE_HTTPS', isProduction),
  logLevel: str('LOG_LEVEL', isProduction ? 'info' : 'debug'),

  dataDir: path.resolve(repoRoot, str('DATA_DIR', 'App_Data')),
  clientDistDir: path.resolve(repoRoot, str('CLIENT_DIST_DIR', 'client/dist')),
  r2: {
    accountId: str('R2_ACCOUNT_ID', ''),
    bucket: str('R2_BUCKET', ''),
    accessKeyId: str('R2_ACCESS_KEY_ID', ''),
    secretAccessKey: str('R2_SECRET_ACCESS_KEY', ''),
  },

  tokenSecret: str('TOKEN_SECRET'),
  invitationTtlHours: int('INVITATION_TTL_HOURS', 72, { min: 1, max: 24 * 30 }),
  groupRetentionDays: int('GROUP_RETENTION_DAYS', 90, { min: 1, max: 3650 }),
  backupsToKeep: int('BACKUPS_TO_KEEP', 5, { min: 1, max: 100 }),
  maxParticipants: int('MAX_PARTICIPANTS', 50, { min: 3, max: 200 }),
  resendCooldownMinutes: int('RESEND_COOLDOWN_MINUTES', 5, { min: 0, max: 1440 }),
  deleteGroupWhenCompleted: bool('DELETE_GROUP_WHEN_COMPLETED', true),

  rateLimits: {
    createGroupPerHour: int('RATE_LIMIT_CREATE_GROUP_PER_HOUR', 5, { min: 1 }),
    resendPerHour: int('RATE_LIMIT_RESEND_PER_HOUR', 20, { min: 1 }),
    apiPer15Min: int('RATE_LIMIT_API_PER_15_MIN', 300, { min: 10 }),
  },

  email: {
    provider: str('EMAIL_PROVIDER', isProduction ? 'smtp' : 'console').toLowerCase(),
    fromName: str('EMAIL_FROM_NAME', 'Amigo Invisible'),
    fromAddress: str('EMAIL_FROM_ADDRESS'),
    maxAttempts: int('EMAIL_MAX_ATTEMPTS', 3, { min: 1, max: 10 }),
    smtp: {
      host: str('SMTP_HOST'),
      port: int('SMTP_PORT', 587, { min: 1, max: 65535 }),
      secure: bool('SMTP_SECURE', false),
      user: str('SMTP_USER'),
      pass: str('SMTP_PASS'),
    },
    brevo: {
      apiKey: str('BREVO_API_KEY'),
    },
  },
};

export function validateConfig(cfg = config) {
  const errors = [];
  if (!cfg.tokenSecret || cfg.tokenSecret.length < 32) {
    errors.push('TOKEN_SECRET es obligatorio y debe tener al menos 32 caracteres (genera uno con: openssl rand -base64 48).');
  }
  const { email } = cfg;
  if (!['smtp', 'brevo', 'console'].includes(email.provider)) {
    errors.push('EMAIL_PROVIDER debe ser "smtp", "brevo" o "console".');
  }
  if (email.provider === 'console' && cfg.isProduction) {
    errors.push('EMAIL_PROVIDER=console no está permitido en producción.');
  }
  if (email.provider !== 'console' && !email.fromAddress) {
    errors.push('EMAIL_FROM_ADDRESS es obligatorio para enviar correos.');
  }
  if (email.provider === 'smtp' && !email.smtp.host) errors.push('SMTP_HOST es obligatorio con EMAIL_PROVIDER=smtp.');
  if (email.provider === 'brevo' && !email.brevo.apiKey) errors.push('BREVO_API_KEY es obligatorio con EMAIL_PROVIDER=brevo.');
  if (cfg.isProduction && !cfg.appBaseUrl.startsWith('https://')) {
    errors.push('APP_BASE_URL debe usar https:// en producción.');
  }
  const r2Values = [cfg.r2?.accountId, cfg.r2?.bucket, cfg.r2?.accessKeyId, cfg.r2?.secretAccessKey];
  const r2Set = r2Values.filter(Boolean).length;
  if (r2Set > 0 && r2Set < 4) {
    errors.push('Para usar Cloudflare R2 hay que definir R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY.');
  }
  cfg.persistentStorage = r2Set === 4 || !process.env.VERCEL;
  if (errors.length > 0) {
    throw new Error(`Configuración inválida (revisa tu archivo .env):\n - ${errors.join('\n - ')}`);
  }
  return cfg;
}

export default config;
