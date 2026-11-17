export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? 'Ha ocurrido un error inesperado.');
    this.status = status;
    this.code = body?.code ?? 'unknown';
    this.details = body?.details ?? [];
  }
}

async function request(method, url, { token, body } = {}) {
  let response;
  try {
    response = await fetch(`/api${url}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ApiError(0, { code: 'network', message: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export const api = {
  config: () => request('GET', '/config'),
  createGroup: (payload) => request('POST', '/groups', { body: payload }),

  adminView: (groupId, token) => request('GET', `/groups/${groupId}/admin`, { token }),
  resendInvitations: (groupId, token, participantIds) =>
    request('POST', `/groups/${groupId}/admin/invitations/resend`, { token, body: participantIds ? { participantIds } : {} }),
  retryResults: (groupId, token) => request('POST', `/groups/${groupId}/admin/results/retry`, { token, body: {} }),
  updateRestrictions: (groupId, token, exclusions) =>
    request('PUT', `/groups/${groupId}/admin/restrictions`, { token, body: { exclusions } }),
  deleteGroup: (groupId, token) => request('DELETE', `/groups/${groupId}/admin`, { token }),

  participantSession: (groupId, token) => request('GET', `/groups/${groupId}/me`, { token }),
  savePreferences: (groupId, token, items) => request('PUT', `/groups/${groupId}/me/preferences`, { token, body: { items } }),
};

/**
 * Recupera el token de acceso del fragmento de la URL (#token). El fragmento
 * nunca se envía al servidor ni aparece en logs; tras leerlo lo guardamos en
 * sessionStorage y lo quitamos de la barra de direcciones.
 */
export function useLinkToken(scope, groupId) {
  const key = `amigo:${scope}:${groupId}`;
  const fromHash = window.location.hash.replace(/^#/, '');
  if (/^[A-Za-z0-9_-]{20,128}$/.test(fromHash)) {
    try {
      sessionStorage.setItem(key, fromHash);
    } catch {
      /* almacenamiento no disponible */
    }
    history.replaceState(history.state, '', window.location.pathname + window.location.search);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function forgetLinkToken(scope, groupId) {
  try {
    sessionStorage.removeItem(`amigo:${scope}:${groupId}`);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Traduce los errores de enlace a la página correspondiente. */
export function linkErrorRoute(err, groupId) {
  if (err.code === 'expired_link') return { name: 'invalid-link', query: { motivo: 'caducado' } };
  if (err.code === 'already_drawn' || err.code === 'group_completed') return { name: 'draw-done', params: { groupId } };
  if (err.code === 'invalid_link' || err.code === 'unauthorized') return { name: 'invalid-link', query: { motivo: 'invalido' } };
  return null;
}
