const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const formatMoney = (amount, currency = 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);

export const formatDate = (isoDate) =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));

const formatDateTime = (iso) =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso));

const COLORS = { red: '#c8102e', green: '#14532d', gold: '#d4a017', cream: '#fff8ef', ink: '#1f2937', muted: '#6b7280' };

function layout({ preheader, title, bodyHtml }) {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.cream};font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${COLORS.ink};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.08);">
    <tr><td style="background:linear-gradient(135deg,${COLORS.red},#9b0d23);padding:28px 32px;text-align:center;">
      <div style="font-size:40px;line-height:1;">🎁</div>
      <div style="color:#fff;font-size:22px;font-weight:700;margin-top:8px;">${escapeHtml(title)}</div>
    </td></tr>
    <tr><td style="padding:28px 32px;font-size:16px;line-height:1.6;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 32px 28px;font-size:12px;color:${COLORS.muted};text-align:center;border-top:1px solid #f1e6d8;">
      Has recibido este correo porque alguien te ha incluido en un sorteo de Amigo Invisible.<br>
      No compartas los enlaces de este mensaje: son personales.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

const button = (href, label) =>
  `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(href)}" style="background:${COLORS.green};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;display:inline-block;">${escapeHtml(label)}</a></p>
   <p style="font-size:12px;color:${COLORS.muted};word-break:break-all;">Si el botón no funciona, copia este enlace en tu navegador:<br>${escapeHtml(href)}</p>`;

const infoBox = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};border-radius:12px;padding:6px 16px;margin:16px 0;">
   ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:${COLORS.muted};">${escapeHtml(k)}</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(v)}</td></tr>`).join('')}
   </table>`;

export function invitationEmail({ participantName, groupName, organizerName, budget, currency, exchangeDate, link, expiresAt }) {
  const money = formatMoney(budget, currency);
  const rows = [
    ['Grupo', groupName],
    ['Organiza', organizerName],
    ['Presupuesto máximo', money],
    ...(exchangeDate ? [['Intercambio', formatDate(exchangeDate)]] : []),
  ];
  const subject = `🎁 Te han invitado al Amigo Invisible "${groupName}"`;
  const html = layout({
    preheader: `${organizerName} te ha invitado. Cuéntanos qué te gustaría recibir.`,
    title: '¡Estás invitado al Amigo Invisible!',
    bodyHtml: `<p>Hola, <strong>${escapeHtml(participantName)}</strong>:</p>
      <p><strong>${escapeHtml(organizerName)}</strong> te ha incluido en el Amigo Invisible <strong>"${escapeHtml(groupName)}"</strong>.</p>
      ${infoBox(rows)}
      <p>Para participar, indica <strong>tres regalos</strong> que te gustaría recibir. No necesitas registrarte.</p>
      ${button(link, 'Indicar mis preferencias')}
      <p style="font-size:14px;color:${COLORS.muted};">El enlace es personal y caduca el <strong>${escapeHtml(formatDateTime(expiresAt))}</strong>. Si caduca, pide al organizador una nueva invitación.</p>`,
  });
  const text = `Hola, ${participantName}:

${organizerName} te ha incluido en el Amigo Invisible "${groupName}".
Presupuesto máximo: ${money}${exchangeDate ? `\nIntercambio: ${formatDate(exchangeDate)}` : ''}

Indica tres regalos que te gustaría recibir en este enlace personal:
${link}

El enlace caduca el ${formatDateTime(expiresAt)}.`;
  return { subject, html, text };
}

export function organizerWelcomeEmail({ organizerName, groupName, adminLink, participantCount }) {
  const subject = `Tu grupo "${groupName}" está listo 🎄`;
  const html = layout({
    preheader: 'Guarda este correo: contiene el enlace privado a tu panel de organizador.',
    title: '¡Tu grupo está creado!',
    bodyHtml: `<p>Hola, <strong>${escapeHtml(organizerName)}</strong>:</p>
      <p>Hemos creado el grupo <strong>"${escapeHtml(groupName)}"</strong> y estamos enviando las invitaciones a los ${participantCount} participantes.</p>
      <p>Desde tu panel privado podrás ver quién ha completado sus preferencias y reenviar invitaciones. El sorteo se hará automáticamente cuando todos hayan respondido.</p>
      ${button(adminLink, 'Abrir mi panel de organizador')}
      <p style="font-size:14px;color:${COLORS.muted};"><strong>Guarda este correo.</strong> Este enlace es la única forma de acceder al panel y no se puede recuperar.</p>`,
  });
  const text = `Hola, ${organizerName}:

Tu grupo "${groupName}" está creado y estamos enviando las invitaciones a los ${participantCount} participantes.

Panel privado de organizador (guarda este enlace, no se puede recuperar):
${adminLink}`;
  return { subject, html, text };
}

export function resultEmail({ giverName, groupName, receiverName, budget, currency, items, exchangeDate }) {
  const money = formatMoney(budget, currency);
  const itemsHtml = items
    .map(
      (item, i) => `<tr><td style="padding:12px 0;border-bottom:1px solid #f1e6d8;vertical-align:top;">
        <div style="font-weight:700;">${i + 1}. ${escapeHtml(item.name)}</div>
        ${item.description ? `<div style="color:${COLORS.muted};font-size:14px;margin-top:4px;">${escapeHtml(item.description)}</div>` : ''}
        ${item.url ? `<div style="font-size:14px;margin-top:4px;"><a href="${escapeHtml(item.url)}" style="color:${COLORS.red};">Ver producto</a></div>` : ''}
      </td></tr>`,
    )
    .join('');
  const subject = `🎅 ¡Ya tienes tu Amigo Invisible de "${groupName}"!`;
  const html = layout({
    preheader: 'El sorteo ya se ha realizado. ¡Descubre a quién te ha tocado!',
    title: '¡Ya tienes tu Amigo Invisible!',
    bodyHtml: `<p>Hola, <strong>${escapeHtml(giverName)}</strong>.</p>
      <p>Ya se ha realizado el sorteo del grupo <strong>"${escapeHtml(groupName)}"</strong>.</p>
      <div style="text-align:center;background:${COLORS.cream};border:2px dashed ${COLORS.gold};border-radius:16px;padding:20px;margin:20px 0;">
        <div style="color:${COLORS.muted};font-size:14px;">Te ha tocado regalar a</div>
        <div style="font-size:28px;font-weight:800;color:${COLORS.red};margin-top:4px;">${escapeHtml(receiverName)}</div>
      </div>
      ${infoBox([['Presupuesto máximo', money], ...(exchangeDate ? [['Intercambio', formatDate(exchangeDate)]] : [])])}
      <p style="margin-bottom:0;"><strong>Estas son sus preferencias:</strong></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemsHtml}</table>
      <p style="text-align:center;font-size:18px;margin-top:24px;">🤫 <strong>¡Recuerda mantenerlo en secreto!</strong></p>`,
  });
  const text = `¡Ya tienes tu Amigo Invisible!

Hola, ${giverName}.

Ya se ha realizado el sorteo del grupo "${groupName}".

Te ha tocado regalar a ${receiverName}.

Presupuesto máximo: ${money}.${exchangeDate ? `\nFecha del intercambio: ${formatDate(exchangeDate)}.` : ''}

Estas son sus preferencias:

${items
  .map((item, i) => `${i + 1}. ${item.name}${item.description ? `\n   ${item.description}` : ''}${item.url ? `\n   ${item.url}` : ''}`)
  .join('\n')}

¡Recuerda mantenerlo en secreto!`;
  return { subject, html, text };
}

export function organizerDrawFailedEmail({ organizerName, groupName }) {
  const subject = `⚠️ No se ha podido realizar el sorteo de "${groupName}"`;
  const html = layout({
    preheader: 'Las restricciones actuales impiden realizar el sorteo.',
    title: 'Hay que revisar las restricciones',
    bodyHtml: `<p>Hola, <strong>${escapeHtml(organizerName)}</strong>:</p>
      <p>Todos los participantes de <strong>"${escapeHtml(groupName)}"</strong> han indicado sus preferencias, pero con las restricciones configuradas no existe ninguna combinación válida para el sorteo.</p>
      <p>Abre tu panel de organizador con el enlace que recibiste al crear el grupo y elimina alguna restricción. El sorteo se realizará automáticamente en cuanto sea posible.</p>`,
  });
  const text = `Hola, ${organizerName}:

Con las restricciones configuradas no existe ninguna combinación válida para el sorteo de "${groupName}".
Abre tu panel de organizador (enlace del correo de creación del grupo) y elimina alguna restricción.`;
  return { subject, html, text };
}

export function organizerCompletedEmail({ organizerName, groupName, participantCount, dataDeleted }) {
  const subject = `✅ Sorteo de "${groupName}" completado`;
  const deletedNote = dataDeleted
    ? 'Como todos han recibido su resultado, hemos eliminado los datos del grupo (participantes, preferencias y resultado). Nadie, ni siquiera tú, puede consultar quién regala a quién.'
    : 'Nadie, ni siquiera tú como organizador, puede consultar quién regala a quién.';
  const html = layout({
    preheader: 'Todos los participantes han recibido su Amigo Invisible.',
    title: '¡Sorteo completado!',
    bodyHtml: `<p>Hola, <strong>${escapeHtml(organizerName)}</strong>:</p>
      <p>El sorteo de <strong>"${escapeHtml(groupName)}"</strong> se ha realizado y los ${participantCount} participantes han recibido su Amigo Invisible por correo.</p>
      <p>${escapeHtml(deletedNote)}</p>
      <p style="text-align:center;font-size:18px;">🎄 ¡Que disfrutéis del intercambio!</p>`,
  });
  const text = `Hola, ${organizerName}:

El sorteo de "${groupName}" se ha realizado y los ${participantCount} participantes han recibido su Amigo Invisible.
${deletedNote}`;
  return { subject, html, text };
}
