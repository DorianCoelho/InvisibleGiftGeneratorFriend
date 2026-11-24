import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

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

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

function storageKey(scope, groupId) {
  return `amigo:${scope}:${groupId}`;
}

function rememberToken(scope, groupId, token) {
  try {
    sessionStorage.setItem(storageKey(scope, groupId), token);
  } catch {
    /* almacenamiento no disponible: el token sigue en la URL de esta visita */
  }
}

function storedToken(scope, groupId) {
  try {
    return sessionStorage.getItem(storageKey(scope, groupId));
  } catch {
    return null;
  }
}

/**
 * Elige el token de esta visita. Un enlace nuevo (en la ruta o en el #) siempre
 * gana al que hubiera guardado el navegador: así, en el mismo dispositivo, cada
 * persona abre su propio formulario y no el de quien respondió antes.
 */
export function readLinkToken(scope, groupId, { param = '', hash = '' } = {}) {
  const fromParam = TOKEN_RE.test(param) ? param : '';
  const fromHash = TOKEN_RE.test(String(hash).replace(/^#/, '')) ? String(hash).replace(/^#/, '') : '';
  const incoming = fromParam || fromHash;
  if (incoming) {
    rememberToken(scope, groupId, incoming);
    return incoming;
  }
  return storedToken(scope, groupId);
}

/**
 * Recupera el token y, si venía en la URL, lo quita de la barra de direcciones
 * después de recordarlo. Hay que llamarlo dentro de setup().
 */
export function useLinkToken(scope, groupId) {
  const route = useRoute();
  const router = useRouter();
  const param = typeof route.params.token === 'string' ? route.params.token : '';
  const token = readLinkToken(scope, groupId, { param, hash: route.hash || window.location.hash });

  onMounted(() => {
    const hashToken = (route.hash || '').replace(/^#/, '');
    if (!TOKEN_RE.test(param) && !TOKEN_RE.test(hashToken)) return;
    // Si no pudimos guardarlo, el token tiene que seguir en la URL.
    if (storedToken(scope, groupId) !== token) return;
    const params = { ...route.params };
    delete params.token;
    router.replace({ name: route.name, params, query: route.query, hash: '' }).catch(() => {});
  });

  return token;
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
