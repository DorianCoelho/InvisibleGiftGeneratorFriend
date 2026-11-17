export class AppError extends Error {
  /**
   * @param {number} status Código HTTP.
   * @param {string} code Código estable que interpreta el cliente.
   * @param {string} message Mensaje legible para el usuario.
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (details, message = 'Revisa los datos introducidos.') => new AppError(400, 'validation_error', message, details),
  invalidLink: () => new AppError(404, 'invalid_link', 'El enlace no es válido o ya no existe.'),
  expiredLink: () =>
    new AppError(410, 'expired_link', 'Tu enlace ha caducado. Pide al organizador que te envíe una nueva invitación.'),
  unauthorized: () => new AppError(401, 'unauthorized', 'No tienes acceso a este grupo.'),
  conflict: (code, message) => new AppError(409, code, message),
  tooManyRequests: (message = 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.') =>
    new AppError(429, 'rate_limited', message),
};

export class DataCorruptionError extends Error {
  constructor(file, cause) {
    super(`Archivo de datos dañado: ${file}`, { cause });
    this.name = 'DataCorruptionError';
  }
}
