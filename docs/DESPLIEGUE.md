# Despliegue en Vercel con Neon

## 1. Preparar Neon

1. Crea un proyecto y una base en Neon.
2. Copia la cadena **pooled** como `DATABASE_URL`.
3. Copia la cadena **directa** como `DATABASE_URL_UNPOOLED`.
4. Mantén `sslmode=require` y no publiques estas cadenas.

## 2. Preparar Vercel Blob

1. En el proyecto de Vercel, crea un almacén Blob.
2. Configura su token como `BLOB_READ_WRITE_TOKEN` en el servidor.
3. Los documentos se crean con acceso privado. No conviertas el almacén en público para expedientes reales.

## 3. Variables de entorno

Configura en Vercel, para Production y Preview según corresponda:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `SESSION_SECRET`
- `BLOB_READ_WRITE_TOKEN`

Genera `SESSION_SECRET` con un gestor de secretos o un generador criptográfico. Debe tener al menos 32 caracteres y no debe reutilizarse entre entornos.

## 4. Aplicar la base de datos

Desde tu equipo, con las variables cargadas en `.env`:

```bash
npm install
npm run db:migrate
npm run db:seed:catalogs
```

Para una demostración aislada puedes ejecutar también:

```bash
npm run db:seed:demo
```

No uses la semilla demo en producción. Revisa el SQL versionado en `db/migrations` antes de aplicar futuras migraciones y conserva una copia de seguridad.

## 5. Importar en Vercel

1. Sube el contenido del paquete a la raíz de un repositorio.
2. Importa ese repositorio en Vercel.
3. Vercel detecta Vite. El archivo `vercel.json` ya define:
   - build: `npm run build`;
   - salida: `frontend/dist`;
   - función: `api/index.ts`;
   - reescrituras SPA sin interceptar `/api/*`.
4. Ejecuta el despliegue desde Vercel o conecta la rama que desees publicar.

La entrega de este ZIP no despliega ni publica el sitio por sí misma.

## 6. Verificación posterior

- Abre `/api/health`: debe responder `{ "ok": true }`.
- Abre la raíz y comprueba el acceso con un usuario creado por ti.
- Revisa un expediente y una descarga privada.
- Ejecuta el flujo de aprobación con dos cuentas distintas.
- Comprueba el menú y los formularios en un teléfono Android.

## Producción

Antes de registrar información real:

- elimina o desactiva los usuarios `*.demo`;
- crea administradores propios con contraseñas únicas;
- cambia cualquier secreto que se haya compartido;
- restringe el acceso al despliegue si la información es interna;
- valida los parámetros legales y las fórmulas con el respaldo documental aplicable;
- configura copias de seguridad y retención de Neon y Blob;
- no uses expedientes de prueba con nombres, cédulas o cuentas reales.
