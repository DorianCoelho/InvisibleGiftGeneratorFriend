import { z } from 'zod';
import { analyzeDraw } from '@amigo-invisible/shared/draw';
import { errors } from './errors.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const text = (min, max, label) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? `${label} es obligatorio.` : `${label} no es válido.`) })
    .transform((v) => v.replace(CONTROL_CHARS, '').trim())
    .pipe(
      z
        .string()
        .min(min, min <= 1 ? `${label} es obligatorio.` : `${label} debe tener al menos ${min} caracteres.`)
        .max(max, `${label} no puede superar ${max} caracteres.`),
    );

const optionalText = (max, label) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ?? '').replace(CONTROL_CHARS, '').trim())
    .pipe(z.string().max(max, `${label} no puede superar ${max} caracteres.`));

const email = z
  .string({ error: 'El correo electrónico es obligatorio.' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo electrónico es demasiado largo.')
  .email('El correo electrónico no es válido.');

const httpUrl = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? '').trim())
  .refine((v) => {
    if (v === '') return true;
    try {
      const url = new URL(v);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'El enlace debe ser una dirección web válida (https://...).')
  .pipe(z.string().max(500, 'El enlace no puede superar 500 caracteres.'));

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'COP', 'CLP', 'PEN'];

const todayIso = () => new Date().toISOString().slice(0, 10);

export function createGroupSchema(maxParticipants) {
  return z
    .object({
      name: text(2, 80, 'El nombre del grupo'),
      budget: z.coerce
        .number({ error: 'El presupuesto debe ser un número.' })
        .positive('El presupuesto debe ser mayor que 0.')
        .max(100000, 'El presupuesto es demasiado alto.')
        .transform((v) => Math.round(v * 100) / 100),
      currency: z.enum(CURRENCIES).default('EUR'),
      exchangeDate: z
        .string()
        .optional()
        .nullable()
        .transform((v) => (v ? v.trim() : null))
        .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), 'La fecha no es válida.')
        .refine((v) => v === null || v >= todayIso(), 'La fecha del intercambio no puede estar en el pasado.'),
      organizer: z.object({
        name: text(2, 60, 'El nombre del organizador'),
        email,
      }),
      participants: z
        .array(
          z.object({
            ref: z.string().min(1).max(64),
            name: text(1, 60, 'El nombre'),
            email,
            exclusions: z.array(z.string().min(1).max(64)).max(maxParticipants).default([]),
          }),
        )
        .min(3, 'Se necesitan al menos 3 participantes.')
        .max(maxParticipants, `El máximo es de ${maxParticipants} participantes.`),
      // Campo trampa anti-bots: los humanos no lo ven ni lo rellenan.
      website: z.string().max(0).optional(),
    })
    .superRefine((data, ctx) => {
      let invalid = false;
      const issue = (path, message) => {
        invalid = true;
        ctx.addIssue({ code: 'custom', path, message });
      };
      const refs = new Set();
      const emails = new Map();
      data.participants.forEach((p, i) => {
        if (refs.has(p.ref)) issue(['participants', i, 'ref'], 'Participante duplicado.');
        refs.add(p.ref);
        if (emails.has(p.email)) {
          issue(['participants', i, 'email'], `Este correo ya está asignado a ${data.participants[emails.get(p.email)].name}.`);
        } else {
          emails.set(p.email, i);
        }
      });
      data.participants.forEach((p, i) => {
        for (const ex of p.exclusions) {
          if (ex === p.ref) {
            issue(['participants', i, 'exclusions'], 'Un participante no puede excluirse a sí mismo.');
          } else if (!refs.has(ex)) {
            issue(['participants', i, 'exclusions'], 'La restricción hace referencia a un participante que no existe.');
          }
        }
      });
      if (invalid) return;
      const analysis = analyzeDraw(data.participants.map((p) => ({ id: p.ref, exclusions: p.exclusions })));
      if (!analysis.possible) {
        const blocked = data.participants.filter((p) => analysis.blockedIds.includes(p.ref)).map((p) => p.name);
        issue(
          ['participants'],
          blocked.length > 0
            ? `Con estas restricciones, ${blocked.join(', ')} no tiene a nadie a quien regalar. Elimina alguna restricción.`
            : 'Las restricciones configuradas hacen imposible el sorteo. Elimina alguna restricción.',
        );
      }
    });
}

export const preferencesSchema = z.object({
  items: z
    .array(
      z.object({
        name: text(2, 120, 'El nombre del regalo'),
        description: optionalText(500, 'La descripción'),
        url: httpUrl,
      }),
    )
    .length(3, 'Debes indicar exactamente tres regalos.'),
});

export const restrictionsSchema = z.object({
  exclusions: z.record(z.string().uuid(), z.array(z.string().uuid()).max(500)),
});

export const participantIdsSchema = z.object({
  participantIds: z.array(z.string().uuid()).max(500).optional(),
});

/** Valida `input` con `schema` y lanza un AppError 400 con detalles por campo. */
export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  throw errors.validation(details, details[0]?.message);
}
