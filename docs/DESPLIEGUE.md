# Despliegue en Vercel con Neon

## 1. Preparar servicios y variables

En Neon crea una base y configura la cadena pooled como `DATABASE_URL` y la directa como `DATABASE_URL_UNPOOLED`. Mantén TLS y no publiques las cadenas. En Vercel crea un Blob privado y configura `BLOB_READ_WRITE_TOKEN`.

Variables de Production y, si se usa una base aislada, Preview:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED` (solo herramientas de migración)
- `SESSION_SECRET`: secreto aleatorio propio de al menos 32 caracteres, distinto por entorno.
- `BLOB_READ_WRITE_TOKEN`
- `DEMO_MODE=false`
- `VITE_DEMO_MODE=false`

No configures `CONFIRM_DEMO_SEED` en Vercel. Las variables `VITE_` quedan incorporadas al frontend durante el build; cambiarlas exige redesplegar. `SESSION_SECRET` también protege mediante HMAC los identificadores de rate limiting.

## 2. Aplicar migraciones

Desde un equipo con las variables del entorno cargadas, revisa el SQL y conserva una copia de seguridad antes de aplicar:

```bash
npm ci
npm run db:migrate
npm run db:seed:catalogs
```

La migración nueva es `db/migrations/0001_yellow_the_hunter.sql`. No modifica la migración inicial. Añade:

- `users.disabledAt`, `users.sessionVersion` y `users.employeeId`;
- `rrhh_auth_sessions` para revocación, caducidad e inactividad;
- `rrhh_login_attempts` para rate limiting persistente;
- metadatos de auditoría y bloqueo efectivo de perfiles previamente inactivos.

No ejecutes estas operaciones contra una base real sin el procedimiento de respaldo y aprobación correspondiente.

## 3. Crear y comprobar el administrador real

```bash
npm run db:create-admin
```

Introduce los datos en la terminal. La contraseña se solicita de forma oculta y debe tener al menos 12 caracteres con mayúsculas, minúsculas, números y símbolos. No se acepta como argumento.

Despliega, abre el dominio, entra con la cuenta creada y comprueba **Administración → Usuarios**. Cierra y vuelve a abrir sesión para verificar la cookie y la sesión persistida.

## 4. Desactivar el modo demo

Si existen cuentas demo:

1. Entra con el administrador real, no con `admin.demo`.
2. En **Administración → Usuarios**, desactiva cada cuenta `*.demo`. Esto incrementa su versión y revoca sus sesiones.
3. En Vercel define `DEMO_MODE=false` y `VITE_DEMO_MODE=false`, o elimina ambas variables.
4. Redespliega Production para recompilar el frontend.
5. Verifica que no aparecen perfiles demo ni valores precargados y que el login demo es rechazado por el backend.

Para entrar inicialmente en un entorno demo aislado, define ambas variables como `true` antes del build. La semilla solo funciona con una base vacía de pruebas y confirmación adicional:

```bash
CONFIRM_DEMO_SEED=YES_DEMO_ONLY npm run db:seed:demo
```

PowerShell:

```powershell
$env:CONFIRM_DEMO_SEED="YES_DEMO_ONLY"
npm run db:seed:demo
Remove-Item Env:CONFIRM_DEMO_SEED
```

## 5. Configuración de Vercel

`vercel.json` define el build `npm run build`, salida `frontend/dist`, función `api/index.ts` y reescrituras SPA. También aplica CSP, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `nosniff`, Referrer-Policy y Permissions-Policy.

HSTS usa `max-age=31536000`, sin `includeSubDomains` ni `preload`. Esas dos opciones pueden afectar a todos los subdominios y dificultar la retirada de HTTPS; solo deben añadirse tras validar todo el dominio y comprender sus implicaciones. Las cookies usan Secure en cualquier `VERCEL_ENV`, incluidos Preview y Production, y solo lo omiten en desarrollo HTTP local.

## 6. Verificación posterior

- `GET /api/health` responde `{ "ok": true }`.
- Login real, logout y recarga funcionan; una sesión revocada recibe 401.
- Una mutación con `Origin` de otro sitio recibe 403.
- El trabajador solo abre su expediente, documentos y recibos.
- El flujo de aprobación usa dos cuentas distintas y un pago repetido no duplica registros.
- Las descargas privadas funcionan como adjuntos y PDF/DOCX inválidos se rechazan.
- Las cabeceras están presentes y la consola no muestra violaciones CSP.
- No hay datos demo ni secretos en el frontend.

## Riesgos operativos pendientes

- Configura copias de seguridad, PITR y restauración probada en Neon; define retención de Blob.
- Un WAF o Vercel Firewall puede complementar, pero no sustituye, el rate limiting de Neon.
- El escaneo antivirus requiere infraestructura adicional; validar tipo y estructura no detecta malware.
- MFA TOTP para administradores queda como endurecimiento pendiente; no hay MFA simulado.
- Prueba rate limiting, cookies Secure, CSP, Blob y revocación contra Preview/Production real antes de incorporar información sensible.
