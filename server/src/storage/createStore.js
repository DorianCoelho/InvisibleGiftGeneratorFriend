import { GroupStore } from './groupStore.js';
import { R2GroupStore } from './r2GroupStore.js';

const r2Ready = (r2) => Boolean(r2?.accountId && r2?.bucket && r2?.accessKeyId && r2?.secretAccessKey);

/** Disco local, o Cloudflare R2 cuando las cuatro variables están definidas. */
export async function createStore(config, logger) {
  if (r2Ready(config.r2)) {
    const { createS3ObjectClient } = await import('./s3ObjectClient.js');
    const store = new R2GroupStore({
      client: createS3ObjectClient(config.r2),
      backupsToKeep: config.backupsToKeep,
      logger,
    });
    try {
      await store.init();
    } catch (err) {
      throw new Error('No se pudo conectar con Cloudflare R2. Revisa el bucket y las claves de API.', { cause: err });
    }
    logger?.info({ bucket: config.r2.bucket }, 'Los grupos se guardan en Cloudflare R2');
    return store;
  }

  const store = new GroupStore({ dataDir: config.dataDir, backupsToKeep: config.backupsToKeep, logger });
  await store.init();
  return store;
}
