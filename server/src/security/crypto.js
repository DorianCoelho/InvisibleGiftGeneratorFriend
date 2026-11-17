import crypto from 'node:crypto';

/**
 * Utilidades criptográficas. Los tokens de acceso se generan con 256 bits de
 * entropía y solo se persiste su HMAC-SHA256 (con un secreto del servidor), de
 * modo que una copia de los archivos JSON no permite reconstruir los enlaces.
 */
export function createCrypto(secret) {
  if (!secret) throw new Error('Se necesita TOKEN_SECRET');
  const hmacKey = crypto.createHash('sha256').update(`hmac:${secret}`).digest();
  const encKey = crypto.createHash('sha256').update(`enc:${secret}`).digest();

  function generateToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  function hashToken(token) {
    return crypto.createHmac('sha256', hmacKey).update(String(token)).digest('hex');
  }

  function tokenMatches(token, storedHash) {
    if (typeof token !== 'string' || typeof storedHash !== 'string' || storedHash.length !== 64) return false;
    const a = Buffer.from(hashToken(token), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** Cifra un objeto JSON con AES-256-GCM (usado para el resultado del sorteo). */
  function encryptJson(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return {
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }

  function decryptJson(envelope) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  }

  return { generateToken, hashToken, tokenMatches, encryptJson, decryptJson };
}

export const newId = () => crypto.randomUUID();
