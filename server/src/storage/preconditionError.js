/** La escritura no se aplicó porque el objeto cambió o ya existía. */
export class PreconditionError extends Error {
  constructor() {
    super('Precondición de escritura no cumplida');
    this.name = 'PreconditionError';
  }
}

export const isPrecondition = (err) => err instanceof PreconditionError || err?.name === 'PreconditionFailed' || err?.$metadata?.httpStatusCode === 412;
