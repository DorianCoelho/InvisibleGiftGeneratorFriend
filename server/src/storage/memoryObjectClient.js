import crypto from 'node:crypto';
import { PreconditionError } from './preconditionError.js';

/**
 * Cubo en memoria con las mismas condiciones que R2 (If-None-Match / If-Match).
 * Sirve para probar el almacén sin red.
 */
export class MemoryObjectClient {
  #objects = new Map();

  async headBucket() {}

  async get(key) {
    const current = this.#objects.get(key);
    return current ? { body: current.body, etag: current.etag } : null;
  }

  async put(key, body, cond = {}) {
    const current = this.#objects.get(key);
    if (cond.ifNoneMatch === '*' && current) throw new PreconditionError();
    if (cond.ifMatch && (!current || current.etag !== cond.ifMatch)) throw new PreconditionError();
    const etag = crypto.randomUUID();
    this.#objects.set(key, { body, etag });
    return { etag };
  }

  async delete(key, cond = {}) {
    const current = this.#objects.get(key);
    if (!current) return;
    if (cond.ifMatch && current.etag !== cond.ifMatch) throw new PreconditionError();
    this.#objects.delete(key);
  }

  async list(prefix) {
    return [...this.#objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async copy(from, to) {
    const current = this.#objects.get(from);
    if (!current) {
      const err = new Error('No such key');
      err.name = 'NoSuchKey';
      throw err;
    }
    this.#objects.set(to, { body: current.body, etag: crypto.randomUUID() });
  }
}
