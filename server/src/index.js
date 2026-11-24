import config, { validateConfig } from './config.js';
import logger from './logger.js';
import { createApp } from './app.js';
import { createEmailSender } from './email/emailSender.js';
import { createCrypto } from './security/crypto.js';
import { createServices } from './services/index.js';
import { createStore } from './storage/createStore.js';

async function main() {
  validateConfig(config);
  if (config.persistentStorage === false) {
    logger.error(
      'La aplicación está en Vercel sin Cloudflare R2. Los JSON se borran al acabar la petición y los enlaces de preferencias dejarán de existir.',
    );
  }
  if (config.email.provider !== 'console' && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.appBaseUrl)) {
    logger.error(
      { appBaseUrl: config.appBaseUrl },
      'APP_BASE_URL apunta a este ordenador. Los enlaces de los correos no se abrirán en el móvil ni en otros dispositivos. Pon la URL pública https de la aplicación y vuelve a enviar las invitaciones.',
    );
  }

  const store = await createStore(config, logger);

  const crypto = createCrypto(config.tokenSecret);
  const sender = createEmailSender(config.email, logger);
  const services = createServices({ config, store, crypto, sender, logger });
  const app = createApp({ config, services, logger });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv, emailProvider: config.email.provider }, 'Servidor iniciado');
  });
  services.maintenance.start();

  const shutdown = (signal) => {
    logger.info({ signal }, 'Deteniendo el servidor');
    services.maintenance.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err: { message: err.message } }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
