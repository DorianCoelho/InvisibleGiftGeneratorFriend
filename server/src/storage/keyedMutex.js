/**
 * Exclusión mutua por clave (un candado por grupo). Las operaciones sobre el
 * mismo grupo se ejecutan en serie y en orden de llegada; las de grupos
 * distintos se ejecutan en paralelo.
 *
 * Nota: protege dentro de un único proceso Node.js. La aplicación está pensada
 * para ejecutarse como una sola instancia (ver README).
 */
export class KeyedMutex {
  #tails = new Map();

  async run(key, fn) {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.#tails.set(key, tail);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }

  isLocked(key) {
    return this.#tails.has(key);
  }
}
