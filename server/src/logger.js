import pino from 'pino';
import config from './config.js';

// Nunca se registran correos, nombres, tokens ni preferencias: solo
// identificadores de grupo/participante y estados. Las rutas de redacción son
// una segunda barrera por si algún objeto sensible llega al logger.
const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'email', '*.email', 'to', '*.to',
      'token', '*.token', 'authorization', '*.authorization', 'headers.authorization',
      'items', '*.items', 'preferences', '*.preferences',
      'pass', '*.pass', 'apiKey', '*.apiKey',
    ],
    censor: '[redactado]',
  },
});

export default logger;
