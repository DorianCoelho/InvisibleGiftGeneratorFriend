import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

async function fsyncDirectory(dir) {
  let handle;
  try {
    handle = await fs.open(dir, 'r');
    await handle.sync();
  } catch {
    // Algunos sistemas (p. ej. Windows) no permiten fsync sobre directorios.
  } finally {
    await handle?.close();
  }
}

/**
 * Escribe un archivo de forma atómica y duradera:
 *  1. escribe en un archivo temporal en el mismo directorio,
 *  2. fuerza el volcado a disco (fsync),
 *  3. lo renombra sobre el destino (rename es atómico en el mismo sistema de archivos),
 *  4. sincroniza el directorio para que el renombrado sobreviva a un corte de luz.
 * Si el proceso muere a mitad, el archivo original queda intacto.
 */
export async function writeFileAtomic(filePath, contents) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await fs.open(tmpPath, 'wx', FILE_MODE);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmpPath, filePath);
    await fsyncDirectory(dir);
  } catch (err) {
    await handle?.close().catch(() => {});
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

export async function writeJsonAtomic(filePath, value) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

export { fsyncDirectory };
