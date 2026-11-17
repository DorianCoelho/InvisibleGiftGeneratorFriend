import config, { validateConfig } from './config.js';
import logger from './logger.js';
import { createApp } from './app.js';
import { createEmailSender } from './email/emailSender.js';
import { createCrypto } from './security/crypto.js';
import { createServices } from './services/index.js';
import { GroupStore } from './storage/groupStore.js';

async function main() {
  validateConfig(config);

  const store = new GroupStore({ dataDir: config.dataDir, backupsToKeep: config.backupsToKeep, logger });
  await store.init();

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
