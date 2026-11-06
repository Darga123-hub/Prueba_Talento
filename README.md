# Módulo de Talento Humano — Vercel + Neon

Módulo responsivo de RRHH con expedientes, movimientos, incidencias, procesos especiales, conceptos, nómina, recibos, pagos, parámetros legales, reportes, usuarios y auditoría. Esta variante es independiente de Kimi y está preparada para desplegarse en Vercel con PostgreSQL de Neon.

## Tecnologías

- React 19, TypeScript y Vite.
- Hono y tRPC 11 como API serverless.
- Drizzle ORM, `pg` y `@vercel/functions` para Neon/PostgreSQL.
- Sesiones JWT en cookie `httpOnly`, contraseñas con `scrypt` y sal aleatoria.
- Vercel Blob privado para los documentos de expedientes.
- Zod para validación de entradas y Superjson para los tipos de tRPC.

## Estructura

```text
frontend/
  src/
    modules/
      auth/             Inicio de sesión
      personal/         Expedientes y documentos
      operaciones/      Movimientos, incidencias y procesos
      nomina/           Conceptos, nómina y recibos
      administracion/   Catálogos, legal, reportes, auditoría y usuarios
    shared/             UI, estilos, hooks y proveedor tRPC
    pages/              Shell de la aplicación
api/
  index.ts              Entrada de Vercel Functions
server/
  app.ts                Aplicación Hono
  router.ts             Router principal tRPC
  auth-router.ts        Login, sesión y logout
  hr-router.ts          Reglas de RRHH
  queries/connection.ts Pool Neon y Drizzle
contracts/
  api.ts                Contrato tipado del API
db/
  schema.ts             Esquema PostgreSQL
  migrations/           Migraciones versionadas
  seed.ts               Catálogos mínimos
  seed-demo.ts          Usuarios demo opcionales
docs/
  ARQUITECTURA.md
  DESPLIEGUE.md
  PRUEBAS.md
vercel.json
.env.example
```

## Puesta en marcha local

Requisitos: Node.js 20 o superior, una base Neon y un almacén Vercel Blob privado.

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` como `.env` y completa los valores con tus propias credenciales. No compartas ese archivo.

3. Aplica el esquema y, opcionalmente, carga los catálogos:

   ```bash
   npm run db:migrate
   npm run db:seed:catalogs
   ```

4. Si deseas probar los perfiles, crea los usuarios demo:

   ```bash
   npm run db:seed:demo
   ```

5. Inicia el entorno local:

   ```bash
   npm run dev
   ```

   Abre `http://localhost:5173`. Vite sirve el frontend y monta la API Hono en `/api`.

## Usuarios de demostración

Todos son perfiles ficticios y comparten la contraseña pública de pruebas `DemoRRHH2026!`.

| Usuario | Perfil | Uso principal |
|---|---|---|
| `admin.demo` | Administrador | Acceso completo y asignación de perfiles |
| `talento.demo` | Talento Humano | Expedientes, documentos y operaciones |
| `nomina.demo` | Nómina | Conceptos, cálculo, revisión y cierre |
| `aprobador.demo` | Aprobador | Aprobación independiente |
| `tesoreria.demo` | Tesorería | Registro de pagos |
| `consulta.demo` | Consulta | Lectura sin operaciones de escritura |

Para comprobar la separación de funciones: calcula y envía una nómina a revisión con `nomina.demo`, intenta aprobarla con esa misma cuenta —el sistema debe rechazarlo— y luego aprueba con `aprobador.demo`. El cierre se realiza con Nómina y el pago con Tesorería.

**Desactiva o sustituye estas cuentas antes de producción. No ejecutes `db:seed:demo` en una base con información real.**

## Comandos

| Comando | Acción |
|---|---|
| `npm run dev` | Entorno local frontend + API |
| `npm run check` | Comprobación estricta de TypeScript |
| `npm run build` | Compila el frontend en `frontend/dist` |
| `npm run db:generate` | Genera una migración después de cambiar `db/schema.ts` |
| `npm run db:migrate` | Aplica migraciones pendientes con la conexión directa |
| `npm run db:seed:catalogs` | Inserta catálogos iniciales sin datos personales |
| `npm run db:seed:demo` | Crea o actualiza los seis perfiles demo |

## Seguridad y límites

- La autorización se aplica en el backend por perfil RRHH; el ocultamiento de botones no sustituye esos controles.
- Quien calcula una nómina no puede aprobarla con la misma cuenta, incluso si es administrador.
- Los pagos son idempotentes y los recibos cerrados no se editan.
- Solo se conservan los últimos cuatro dígitos de una cuenta bancaria.
- Los documentos se guardan en Blob privado, no en PostgreSQL ni en el navegador.
- Las descargas usan URL temporal; no se expone el token de Blob al frontend.
- En esta variante la subida se limita a **3 MB por documento** para permanecer por debajo del límite de solicitud de Vercel Functions. Para archivos mayores debe implementarse carga directa con tokens de cliente.
- Las sesiones duran ocho horas. `SESSION_SECRET` debe ser aleatorio, propio y de al menos 32 caracteres.
- No se utiliza RLS de Supabase: Neon se protege mediante las reglas del backend y las claves permanecen exclusivamente en el servidor.

La descripción completa del despliegue está en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).
