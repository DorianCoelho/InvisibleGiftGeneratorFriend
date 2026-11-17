# 🎁 Amigo Invisible

Aplicación web para organizar sorteos de Amigo Invisible: crea un grupo, define restricciones, cada participante indica tres regalos que le gustaría recibir y, cuando todos han respondido, el sorteo se hace solo y cada uno recibe su resultado por correo.

- **Frontend:** Vue 3 + Vite + Vue Router + Bootstrap 5 (JavaScript)
- **Backend:** Node.js + Express (JavaScript)
- **Persistencia:** archivos JSON en el servidor. **Sin base de datos.**
- **Correo:** SMTP (Nodemailer) o API de Brevo, configurado en `.env`

---

## Puesta en marcha (desarrollo)

Requisitos: Node.js 20.11 o superior.

```bash
npm install
cp .env.example .env
# Edita .env y como mínimo define TOKEN_SECRET:
#   openssl rand -base64 48
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000

Con `EMAIL_PROVIDER=console` (el valor por defecto en desarrollo) los correos **no se envían**: se muestran en la terminal, incluidos los enlaces, para que puedas probar todo el flujo sin un servidor de correo.

### Producción sin Docker

```bash
npm install
npm run build          # compila el frontend en client/dist
NODE_ENV=production npm start
```

El servidor Node sirve el frontend compilado y la API en el mismo puerto.

---

## Configuración del correo (`.env`)

Todas las variables están documentadas en [`.env.example`](.env.example). Las relativas al correo:

| Variable | Descripción |
| --- | --- |
| `EMAIL_PROVIDER` | `smtp`, `brevo` o `console` (solo desarrollo) |
| `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS` | Remitente de los correos |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Para `EMAIL_PROVIDER=smtp` |
| `BREVO_API_KEY` | Para `EMAIL_PROVIDER=brevo` |

**Brevo por API** (recomendado):

```env
EMAIL_PROVIDER=brevo
EMAIL_FROM_ADDRESS=no-reply@tudominio.com   # remitente verificado en Brevo
BREVO_API_KEY=xkeysib-...
```

**Brevo por SMTP:**

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-login-smtp@smtp-brevo.com
SMTP_PASS=tu-clave-smtp
```

**Gmail** (requiere verificación en dos pasos y una *contraseña de aplicación*):

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tucuenta@gmail.com
SMTP_PASS=contraseña-de-aplicación
EMAIL_FROM_ADDRESS=tucuenta@gmail.com
```

Al arrancar, la aplicación valida la configuración y se niega a iniciar si falta algo obligatorio (por ejemplo `TOKEN_SECRET` o las credenciales del proveedor elegido).

> `APP_BASE_URL` debe ser la URL pública desde la que se abre la aplicación: se usa para construir los enlaces de los correos. En desarrollo, `http://localhost:5173`.

---

## Cómo funciona

1. **Crear grupo** (asistente en 3 pasos): datos del grupo → participantes y restricciones → confirmación. Se valida que no haya correos repetidos y que las restricciones permitan el sorteo (se comprueba la existencia de un emparejamiento perfecto, no solo que cada uno tenga alguna opción).
2. **Invitaciones:** cada participante recibe un enlace personal válido 72 h. El organizador recibe el enlace privado a su panel.
3. **Preferencias:** cada participante indica tres regalos (nombre, descripción y enlace opcionales). Puede modificarlos mientras su enlace siga activo y no se haya sorteado.
4. **Sorteo automático:** al guardar las últimas preferencias se sortea una única vez. El resultado se guarda cifrado **antes** de enviar ningún correo.
5. **Resultados:** cada participante recibe a quién le toca regalar, el presupuesto, la fecha y las tres preferencias de esa persona. Los envíos fallidos se reintentan automáticamente y también desde el panel, sin repetir el sorteo.
6. **Borrado:** cuando todos han recibido su resultado se eliminan los datos del grupo (configurable con `DELETE_GROUP_WHEN_COMPLETED`). Solo queda un marcador sin datos personales para que el panel muestre "completado".

### Panel del organizador

Muestra participantes completados y pendientes, estado y caducidad de cada invitación, estado del sorteo y de los correos de resultado. Permite reenviar invitaciones (genera un enlace nuevo de 72 h e invalida el anterior), reintentar resultados fallidos, editar restricciones si el sorteo resultó imposible y eliminar el grupo. **No** muestra quién regala a quién ni las preferencias de nadie.

---

## Almacenamiento en archivos JSON

```text
App_Data/                       (DATA_DIR, fuera de cualquier carpeta pública)
├── Groups/
│   └── {GroupId}/
│       ├── group.json          configuración y estado; hash del token del organizador
│       ├── participants.json   participantes y restricciones
│       ├── preferences.json    preferencias de regalos
│       ├── invitations.json    hash de cada token, emisión, caducidad, estado de envío
│       ├── draw.json           resultado del sorteo, cifrado con AES-256-GCM
│       └── email-status.json   estado de cada correo de resultado
├── Backups/{GroupId}/{fecha}_{motivo}/   instantáneas completas del grupo
└── Completed/{GroupId}.json    marcador de grupo finalizado (sin datos personales)
```

Garantías del servicio de persistencia (`server/src/storage/`):

- **Escritura atómica:** se escribe en un archivo temporal, se hace `fsync`, se renombra sobre el original y se sincroniza el directorio. Un corte a mitad nunca deja un JSON a medias.
- **Creación atómica de grupos:** todos los archivos se preparan en un directorio temporal que se renombra al final.
- **Concurrencia:** cada grupo tiene su propio candado; las lecturas-modificaciones-escrituras del mismo grupo se serializan. Si varios participantes terminan a la vez, solo el primero sortea; el resto ya encuentra `draw.json`.
- **Rutas seguras:** el identificador de grupo debe ser un UUID válido, los nombres de archivo salen de una lista blanca y se verifica que la ruta resuelta queda dentro de `Groups/`.
- **Copias de seguridad:** instantánea al crear el grupo, antes y después del sorteo y al cambiar restricciones (se conservan `BACKUPS_TO_KEEP`). Si un archivo aparece dañado, se restaura automáticamente desde la copia más reciente.
- **Recuperación al reiniciar:** al arrancar se reanudan las invitaciones y los envíos de resultados interrumpidos y se completa cualquier sorteo pendiente.
- **Conservación:** una tarea horaria elimina los grupos con más de `GROUP_RETENTION_DAYS` días, sus copias y los marcadores antiguos.

> La aplicación está diseñada para ejecutarse como **una única instancia** (los candados son en memoria). No la escales horizontalmente sobre el mismo volumen.

---

## Seguridad

- Sin registro ni contraseñas: acceso mediante enlaces con tokens aleatorios de 256 bits.
- Los tokens se guardan solo como **HMAC-SHA256** (con `TOKEN_SECRET`), nunca en texto plano, y se comparan en tiempo constante.
- Los tokens viajan en el **fragmento de la URL** (`#token`), que el navegador nunca envía al servidor ni aparece en logs de proxies; el frontend lo manda en la cabecera `Authorization` y lo quita de la barra de direcciones.
- Enlaces de participante con caducidad de 72 h; reenviar invalida el anterior.
- El resultado del sorteo se guarda cifrado (AES-256-GCM) y nadie, ni el organizador, puede consultarlo.
- Límites de frecuencia por IP: creación de grupos, reenvíos de invitaciones y API en general, más un tiempo mínimo entre reenvíos al mismo participante.
- Cabeceras de seguridad con Helmet (CSP estricta, `Referrer-Policy: no-referrer`, HSTS en producción) y redirección a HTTPS con `FORCE_HTTPS`.
- Los logs solo registran identificadores y estados; nunca correos, nombres, tokens ni preferencias.
- El organizador puede eliminar el grupo y todos sus datos (incluidas copias) en cualquier momento.

---

## Docker

```bash
cp .env.example .env
# En .env: NODE_ENV=production, TOKEN_SECRET, APP_BASE_URL=https://tu-dominio,
#          proveedor de correo y DOMAIN=tu-dominio (para el certificado HTTPS)
docker compose up -d --build
```

- `app`: la aplicación. Sus datos viven en el volumen persistente `amigo-data` montado en `/data`, así que sobreviven a reinicios y actualizaciones del contenedor.
- `caddy`: proxy inverso con HTTPS automático (Let's Encrypt) para el dominio indicado en `DOMAIN`.

Para hacer una copia del volumen:

```bash
docker run --rm -v amigo-invisible_amigo-data:/data -v "$PWD":/backup alpine tar czf /backup/amigo-data.tgz -C /data .
```

---

## Tests

```bash
npm test
```

Cubren el algoritmo del sorteo (restricciones, imposibilidad, aleatoriedad), la persistencia (escrituras concurrentes, recuperación desde copia, rutas maliciosas) y el flujo completo vía HTTP (creación, invitaciones, caducidad, reenvío, sorteo simultáneo, reintento de correos y borrado final).

## Estructura

```text
shared/        algoritmo del sorteo (lo usan servidor y cliente)
server/src/
  storage/     persistencia JSON: escritura atómica, candados, copias
  security/    tokens y cifrado
  services/    lógica de negocio: grupos, participantes, sorteo, correos, mantenimiento
  email/       proveedores de correo y plantillas
  routes/      API REST
client/src/
  views/       páginas (inicio, asistente, preferencias, panel, sorteo, enlace inválido)
  components/  asistente por pasos y componentes reutilizables
  stores/      estado del asistente
```
