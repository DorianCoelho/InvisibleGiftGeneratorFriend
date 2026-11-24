export const formatMoney = (amount, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number(amount) % 1 === 0 ? 0 : 2,
  }).format(Number(amount) || 0);

/** Texto del rango de gasto, por ejemplo "de 10 € a 30 €". */
export function formatBudgetRange(min, max, currency = 'EUR') {
  const high = max ?? min;
  const low = min ?? high;
  if (low == null || high == null) return '';
  const from = formatMoney(low, currency);
  const to = formatMoney(high, currency);
  return `de ${from} a ${to}`;
}

export const formatDate = (isoDate) =>
  isoDate ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`)) : '';

export const formatDateTime = (iso) =>
  iso ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';

export function timeLeft(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'caducado';
  const hours = Math.floor(ms / 3600000);
  if (hours >= 24) return `${Math.floor(hours / 24)} d ${hours % 24} h`;
  if (hours >= 1) return `${hours} h`;
  return `${Math.max(1, Math.floor(ms / 60000))} min`;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', MXN: '$', ARS: '$', COP: '$', CLP: '$', PEN: 'S/' };
