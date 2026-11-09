# Módulo de Talento Humano — Vercel + Neon

Módulo responsivo de RRHH con expedientes, movimientos, incidencias, procesos especiales, conceptos, nómina, recibos, pagos, parámetros legales, reportes, usuarios y auditoría. Usa React 19, TypeScript, Vite, Hono, tRPC 11, Drizzle, PostgreSQL de Neon y Vercel Blob privado. Neon Auth permanece desactivado.

## Puesta en marcha

Requisitos: Node.js 20 o superior, una base Neon y un almacén Vercel Blob privado.

```bash
npm ci
```

Copia `.env.example` como `.env` y completa los valores sin compartir ese archivo. Aplica migraciones y catálogos únicamente sobre el entorno que corresponda:

```bash
npm run db:migrate
npm run db:seed:catalogs
npm run dev
```

Abre `http://localhost:5173`. Vite sirve el frontend y monta la API Hono en `/api`.

## Modo demo aislado

El modo demo está desactivado por defecto y exige `DEMO_MODE=true` en el servidor y `VITE_DEMO_MODE=true` al compilar el frontend. Usa solo una base vacía de pruebas, sin información real.

```bash
npm run db:migrate
npm run db:seed:catalogs
CONFIRM_DEMO_SEED=YES_DEMO_ONLY npm run db:seed:demo
```

En PowerShell:

```powershell
$env:CONFIRM_DEMO_SEED="YES_DEMO_ONLY"
npm run db:seed:demo
Remove-Item Env:CONFIRM_DEMO_SEED
```

Las seis cuentas ficticias (`admin.demo`, `talento.demo`, `nomina.demo`, `aprobador.demo`, `tesoreria.demo` y `consulta.demo`) comparten la contraseña pública `DemoRRHH2026!`. El backend las rechaza cuando `DEMO_MODE` no es `true`, aunque sigan existiendo en la base.

## Crear el primer administrador real y salir del modo demo

1. Aplica `0001_yellow_the_hunter.sql` mediante `npm run db:migrate` en el entorno elegido.
2. Ejecuta `npm run db:create-admin`. El comando pide usuario, nombre, correo y contraseña de forma interactiva; la contraseña no aparece en la terminal ni en la línea de comandos.
3. Inicia sesión con la nueva cuenta, cierra la sesión demo y comprueba que puedes abrir **Administración → Usuarios**.
4. Desde esa pantalla desactiva todas las cuentas `*.demo`. El sistema impide desactivar al último administrador global activo.
5. Configura `DEMO_MODE=false` y `VITE_DEMO_MODE=false` (o elimina ambas) en Vercel.
6. Redespliega Production. Comprueba que el login ya no muestra ni precarga demos y que `admin.demo` recibe el error genérico de autenticación.

La guía detallada está en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Comandos

| Comando | Acción |
|---|---|
| `npm run dev` | Entorno local frontend + API |
| `npm run check` | Comprobación estricta de TypeScript |
| `npm run build` | Compila el frontend en `frontend/dist` |
| `npm test` | Pruebas automatizadas sin base ni credenciales |
| `npm run db:generate` | Genera una migración nueva tras cambiar el esquema |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed:catalogs` | Inserta catálogos sin datos personales |
| `npm run db:seed:demo` | Semilla demo con doble confirmación |
| `npm run db:create-admin` | Crea un administrador global interactivamente |
| `npm audit --omit=dev` | Audita exclusivamente dependencias de producción |

## Autorización y seguridad

- El rol global `admin` gestiona usuarios. El perfil RRHH `administrador` gestiona operaciones, pero no puede crear ni elevar administradores globales.
- `consulta` tiene lectura general de expedientes, nóminas, operaciones, catálogos, parámetros y bitácora; no escribe. Debe asignarse solo a personal autorizado para ese alcance.
- `trabajador` requiere `users.employeeId` y solo consulta su expediente, documentos y recibos. Los IDs ajenos se rechazan en el servidor.
- Desactivar una cuenta, cambiar su perfil o cambiar/restablecer su contraseña revoca sus sesiones. No existe degradación de inactivo a `consulta`.
- JWT en cookie `httpOnly`, `sameSite=lax`, `path=/` y `secure` en Vercel Preview/Production; caducidad absoluta de ocho horas e inactividad máxima de una hora. Las sesiones se validan y revocan en Neon.
- Login con rate limiting persistente por IP y por IP/usuario, hashes HMAC y bloqueo progresivo. Mensajes de autenticación genéricos.
- Contraseñas con scrypt, sal aleatoria y `timingSafeEqual`; mínimo 12 caracteres con mayúsculas, minúsculas, números y símbolos.
- Blob privado, máximo 3 MB, extensión/MIME/magic bytes y estructura OOXML para DOCX. Las descargas son adjuntos y la inserción fallida intenta limpiar el Blob.
- CSV con BOM, CRLF, escape de comillas y neutralización de fórmulas.
- CSP sin `unsafe-eval`, HSTS sin `includeSubDomains` ni `preload`, validación same-origin de mutaciones y errores sin stack en las respuestas.
- Los contadores de login se eliminan tras 24 horas. La bitácora y sus hashes de IP se conservan dos años; ajusta esta política si la normativa aplicable exige otro plazo.

## Riesgos pendientes

No se simula MFA ni antivirus. MFA TOTP para cuentas privilegiadas, escaneo antivirus, WAF, copias de seguridad/PITR, alertas y pruebas contra el despliegue real requieren configuración o infraestructura adicional. Revisa también los resultados de dependencias en `docs/PRUEBAS.md`.
