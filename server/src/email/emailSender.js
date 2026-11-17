import nodemailer from 'nodemailer';

/**
 * Crea el emisor de correo según EMAIL_PROVIDER:
 *  - smtp:    cualquier servidor SMTP (incluido el relay SMTP de Brevo).
 *  - brevo:   API transaccional de Brevo (https://api.brevo.com/v3/smtp/email).
 *  - console: solo desarrollo; imprime los correos en la terminal.
 *
 * @returns {{ send: (msg: { to: string, toName?: string, subject: string, html: string, text: string }) => Promise<void> }}
 */
export function createEmailSender(emailConfig, logger) {
  const from = { name: emailConfig.fromName, address: emailConfig.fromAddress ?? 'no-reply@localhost' };

  switch (emailConfig.provider) {
    case 'smtp': {
      const { host, port, secure, user, pass } = emailConfig.smtp;
      const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
        pool: true,
        maxConnections: 3,
      });
      transport.verify().then(
        () => logger.info('Conexión SMTP verificada'),
        (err) => logger.error({ err: { message: err.message, code: err.code } }, 'No se pudo verificar la conexión SMTP'),
      );
      return {
        async send({ to, toName, subject, html, text }) {
          const info = await transport.sendMail({ from, to: toName ? { name: toName, address: to } : to, subject, html, text });
          // Con la cuenta de pruebas de Ethereal, mostrar dónde ver el correo capturado.
          const previewUrl = host === 'smtp.ethereal.email' ? nodemailer.getTestMessageUrl(info) : null;
          if (previewUrl) logger.info({ previewUrl }, 'Correo de prueba capturado por Ethereal');
        },
      };
    }

    case 'brevo':
      return {
        async send({ to, toName, subject, html, text }) {
          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              'api-key': emailConfig.brevo.apiKey,
            },
            body: JSON.stringify({
              sender: { name: from.name, email: from.address },
              to: [{ email: to, ...(toName ? { name: toName } : {}) }],
              subject,
              htmlContent: html,
              textContent: text,
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) {
            const body = await response.text().catch(() => '');
            const err = new Error(`Brevo respondió ${response.status}`);
            err.code = `BREVO_${response.status}`;
            err.detail = body.slice(0, 200);
            throw err;
          }
        },
      };

    case 'console':
      logger.warn('EMAIL_PROVIDER=console: los correos se mostrarán en la terminal y NO se enviarán.');
      return {
        async send({ to, subject, text }) {
          const line = '─'.repeat(70);
          // Salida intencionada a stdout (no al logger) solo en desarrollo.
          console.log(`\n${line}\n📧 Para: ${to}\n   Asunto: ${subject}\n${line}\n${text}\n${line}\n`);
        },
      };

    default:
      throw new Error(`Proveedor de correo no soportado: ${emailConfig.provider}`);
  }
}

/** Describe un error de envío sin incluir datos personales. */
export function describeEmailError(err) {
  const code = err?.code ?? err?.responseCode ?? 'ERROR';
  const message = String(err?.message ?? 'Error desconocido').replace(/[\w.+-]+@[\w.-]+/g, '[correo]');
  return `${code}: ${message}`.slice(0, 200);
}
