import { reactive, watch } from 'vue';
import { analyzeDraw } from '@amigo-invisible/shared/draw';
import { EMAIL_RE } from '../format.js';

const STORAGE_KEY = 'amigo:wizard';
export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 50;

const newRef = () => `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const blankParticipant = () => ({ ref: newRef(), name: '', email: '', exclusions: [] });

const blank = () => ({
  group: {
    name: '',
    participantCount: 4,
    budgetMin: 10,
    budgetMax: 30,
    currency: 'EUR',
    exchangeDate: '',
    organizerName: '',
    organizerEmail: '',
  },
  participants: [],
  reciprocal: true,
  website: '',
  created: null,
});

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.group) {
      const group = { ...blank().group, ...saved.group };
      // Grupos empezados cuando solo existía un presupuesto máximo.
      if (group.budgetMin == null && group.budget != null) group.budgetMin = group.budget;
      if (group.budgetMax == null && group.budget != null) group.budgetMax = group.budget;
      delete group.budget;
      return { ...blank(), ...saved, group };
    }
  } catch {
    /* almacenamiento no disponible o datos antiguos */
  }
  return blank();
}

/** Estado del asistente de creación; se conserva en sessionStorage si se recarga la página. */
export const wizard = reactive(load());

watch(
  wizard,
  (value) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* sin persistencia: el asistente sigue funcionando en memoria */
    }
  },
  { deep: true },
);

export function resetWizard() {
  Object.assign(wizard, blank());
}

/** Ajusta el número de filas de participantes al número indicado en el paso 1. */
export function syncParticipantRows() {
  const count = Number(wizard.group.participantCount);
  while (wizard.participants.length < count) wizard.participants.push(blankParticipant());
  if (wizard.participants.length > count) {
    wizard.participants.splice(count);
    const refs = new Set(wizard.participants.map((p) => p.ref));
    for (const p of wizard.participants) p.exclusions = p.exclusions.filter((r) => refs.has(r));
  }
}

export function toggleExclusion(participant, otherRef) {
  const other = wizard.participants.find((p) => p.ref === otherRef);
  const has = participant.exclusions.includes(otherRef);
  const set = (p, ref, on) => {
    const i = p.exclusions.indexOf(ref);
    if (on && i === -1) p.exclusions.push(ref);
    if (!on && i !== -1) p.exclusions.splice(i, 1);
  };
  set(participant, otherRef, !has);
  if (wizard.reciprocal && other) set(other, participant.ref, !has);
}

export const displayName = (p, index) => p.name.trim() || `Participante ${index + 1}`;

function amountError(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return `${label} debe ser mayor que 0.`;
  if (amount > 100000) return `${label} es demasiado alto.`;
  return null;
}

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

export function validateGroupStep() {
  const g = wizard.group;
  const errors = {};
  const name = g.name.trim();
  if (name.length < 2) errors.name = 'Indica un nombre para el grupo (mínimo 2 caracteres).';
  else if (name.length > 80) errors.name = 'Máximo 80 caracteres.';

  const count = Number(g.participantCount);
  if (!Number.isInteger(count) || count < MIN_PARTICIPANTS || count > MAX_PARTICIPANTS) {
    errors.participantCount = `Debe haber entre ${MIN_PARTICIPANTS} y ${MAX_PARTICIPANTS} participantes.`;
  }
  const minError = amountError(g.budgetMin, 'El mínimo');
  const maxError = amountError(g.budgetMax, 'El máximo');
  if (minError) errors.budgetMin = minError;
  if (maxError) errors.budgetMax = maxError;
  else if (!minError && Number(g.budgetMin) > Number(g.budgetMax)) {
    errors.budgetMax = 'El máximo debe ser mayor o igual que el mínimo.';
  }

  if (g.organizerName.trim().length < 2) errors.organizerName = 'Indica tu nombre.';
  if (!EMAIL_RE.test(g.organizerEmail.trim())) errors.organizerEmail = 'Introduce un correo electrónico válido.';
  if (g.exchangeDate && g.exchangeDate < new Date().toISOString().slice(0, 10)) {
    errors.exchangeDate = 'La fecha no puede estar en el pasado.';
  }
  return errors;
}

export function validateParticipantsStep() {
  const fields = {};
  const general = [];
  const emails = new Map();
  wizard.participants.forEach((p, i) => {
    const e = {};
    if (!p.name.trim()) e.name = 'El nombre es obligatorio.';
    else if (p.name.trim().length > 60) e.name = 'Máximo 60 caracteres.';
    const email = p.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) e.email = 'Correo electrónico no válido.';
    else if (emails.has(email)) e.email = `Correo repetido (ya lo usa ${displayName(wizard.participants[emails.get(email)], emails.get(email))}).`;
    else emails.set(email, i);
    if (Object.keys(e).length) fields[p.ref] = e;
  });

  const analysis = analyzeDraw(wizard.participants.map((p) => ({ id: p.ref, exclusions: p.exclusions })));
  if (!analysis.possible && wizard.participants.length >= MIN_PARTICIPANTS) {
    const blocked = wizard.participants
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => analysis.blockedIds.includes(p.ref))
      .map(({ p, i }) => displayName(p, i));
    general.push(
      blocked.length
        ? `Con estas restricciones, ${blocked.join(', ')} no tendría a nadie a quien regalar.`
        : 'Con estas restricciones no existe ninguna combinación posible para el sorteo. Elimina alguna restricción.',
    );
  }
  return { fields, general, drawPossible: analysis.possible };
}

export function isStepValid(step) {
  if (step === 1) return Object.keys(validateGroupStep()).length === 0;
  if (step === 2) {
    if (wizard.participants.length !== Number(wizard.group.participantCount)) return false;
    const { fields, general } = validateParticipantsStep();
    return Object.keys(fields).length === 0 && general.length === 0;
  }
  return true;
}

export function toPayload() {
  const g = wizard.group;
  return {
    name: g.name.trim(),
    budgetMin: roundMoney(g.budgetMin),
    budgetMax: roundMoney(g.budgetMax),
    currency: g.currency,
    exchangeDate: g.exchangeDate || null,
    organizer: { name: g.organizerName.trim(), email: g.organizerEmail.trim() },
    participants: wizard.participants.map((p) => ({
      ref: p.ref,
      name: p.name.trim(),
      email: p.email.trim(),
      exclusions: p.exclusions,
    })),
    website: wizard.website,
  };
}
