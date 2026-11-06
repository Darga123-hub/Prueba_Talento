# Arquitectura

## Visión general

El navegador carga una SPA React. Las operaciones se envían a `/api/trpc`, atendidas por una función Hono en Vercel. El servidor valida la sesión, comprueba el perfil RRHH, valida la entrada con Zod y ejecuta consultas Drizzle contra Neon. Los archivos se almacenan por separado en Vercel Blob privado.

```text
React / módulos de dominio
          │ contrato AppRouter
          ▼
Hono + tRPC / validación + permisos + auditoría
          │
          ├── Drizzle + pg + pool ──► Neon PostgreSQL
          └── Vercel Blob privado ──► documentos
```

## Decisiones técnicas

- **Neon con `pg` y `attachDatabasePool`**: permite conservar transacciones interactivas para calcular nóminas y registrar pagos. La cadena `DATABASE_URL` debe usar el pooler de Neon.
- **Conexión directa para migraciones**: `DATABASE_URL_UNPOOLED` se usa en Drizzle Kit. Si no existe, se utiliza `DATABASE_URL`.
- **Una función serverless**: `api/index.ts` exporta la aplicación Hono. Las rutas de frontend se reescriben a `index.html`; `/api/*` queda reservado para el backend.
- **Autorización en servidor**: cada procedimiento protegido obtiene el usuario desde la cookie firmada. `hr-router.ts` aplica los perfiles y registra auditoría.
- **Contratos tipados**: `contracts/api.ts` expone únicamente el tipo `AppRouter`. El frontend no importa implementación del servidor ni credenciales.
- **Módulos con dependencias en un solo sentido**: los módulos consumen `shared`; no se importan entre sí. La navegación principal los integra en `pages/Home.tsx`.
- **Estilos centralizados**: la paleta Azules Fríos se mantiene en `shared/styles`; no hay editor de colores.

## Integridad de nómina

1. Nómina calcula un borrador y sus recibos dentro de una transacción.
2. Nómina envía el ciclo a revisión.
3. Un aprobador distinto del creador lo aprueba.
4. Nómina cierra el ciclo aprobado.
5. Tesorería registra el pago. La restricción única por nómina y la comprobación previa evitan duplicar el pago en el flujo normal; una repetición devuelve un resultado idempotente.

Los importes se almacenan como `numeric`, no como números flotantes de PostgreSQL. Los detalles de cálculo se conservan en JSONB para mantener la explicación de cada recibo.

## Datos sensibles

- El hash de contraseña nunca se incluye en las respuestas de usuario.
- Las cookies son `httpOnly`, `sameSite=lax` y `secure` en producción.
- No se guarda el número bancario completo.
- Los reportes y descargas requieren sesión y permisos del servidor.
- Los secretos se leen solo de variables de entorno del servidor.

## Escalabilidad posterior

Para documentos mayores de 3 MB se recomienda añadir cargas directas a Blob mediante `handleUpload`, conservando la comprobación de sesión, tipo y tamaño en el servidor. Si se requiere aislamiento por organización, debe añadirse `organizationId` a las tablas y a todas las consultas antes de compartir la base entre entes.
