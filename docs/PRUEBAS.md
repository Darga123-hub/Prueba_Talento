# Guía de pruebas

## Pruebas automatizadas

```bash
npm ci
npm run check
npm run build
npm test
npm audit
npm audit --omit=dev
```

`npm test` usa `node:test` mediante `tsx`, dobles en memoria y ninguna credencial o conexión externa. Cubre:

1. Cuenta desactivada o con versión antigua: 401 en lectura y escritura.
2. Trabajador sin vínculo o con ID de expediente ajeno: denegación.
3. Documentos de otro trabajador: denegación por la misma regla de propiedad.
4. Perfil administrador RRHH sin rol global: no puede crear administradores globales.
5. Protección del último administrador global.
6. `publicUser`, usado por `hr.session` y `users.list`, sin `passwordHash`, `sessionVersion` ni `unionId`.
7. Login demo bloqueado cuando el modo demo está desactivado.
8. Umbral y bloqueo progresivo, respuesta 429 y límite por IP al cambiar username.
9. Revocación por logout, cambio de versión e inactividad.
10. PDF falso, ejecutable renombrado y MIME discordante.
11. DOCX válido y ZIP renombrado sin el tipo OOXML de Word.
12. Fórmulas CSV con `=`, `+`, `@`, espacios, tabulador y retorno; comillas y BOM/CRLF.
13. Dos transiciones concurrentes: una actualización y un CONFLICT.
14. Dos pagos concurrentes: una inserción y una respuesta idempotente.
15. Respuesta tRPC de error sin stack ni detalle interno.

La prueba de errores escribe deliberadamente un error en el log del servidor; la aserción verifica que ese detalle no aparece en la respuesta HTTP.

## Pruebas manuales contra un entorno aislado

### Acceso y sesiones

1. Entra con una cuenta real, recarga y cierra sesión. Repetir una solicitud con la cookie anterior debe devolver 401.
2. Cambia la contraseña y comprueba que todas las sesiones anteriores quedan inválidas.
3. Desactiva un usuario desde otro administrador global y verifica que ni lecturas ni escrituras funcionan.
4. Introduce cinco contraseñas incorrectas para la misma IP/usuario: debe responder 429. Cambiar solo el usuario no debe evitar el límite de IP al alcanzarlo.
5. Con `DEMO_MODE=false`, una cuenta demo existente debe recibir el mensaje genérico de autenticación.

### Permisos

- `consulta`: lectura general documentada, sin escritura.
- `trabajador`: solo expediente propio, documentos propios y recibos propios; sin dashboard general ni bitácora.
- `talento`: expedientes, documentos y operaciones.
- `nomina`: conceptos, cálculo, revisión y cierre; no pagos ni administración global.
- `tesoreria`: pagos de nóminas cerradas.
- `aprobador`: aprobación independiente.
- Perfil RRHH `administrador`: operaciones administrativas, pero no gestión global de cuentas.
- Rol global `admin`: usuarios, perfiles, activación, contraseñas y validación jurídica.

### Nómina y concurrencia

1. Registra un expediente ficticio, calcula y envía una nómina a revisión.
2. La cuenta creadora no puede aprobarla; usa un aprobador distinto.
3. Cierra con Nómina y registra el pago con Tesorería.
4. Repite el pago: debe ser idempotente.
5. Envía dos transiciones simultáneas: solo una debe actualizar; la otra devuelve CONFLICT y no escribe un éxito falso.
6. Revisa la bitácora sin contraseñas, tokens, cookies ni secretos.

### Documentos, CSV y cabeceras

- Adjunta PDF, PNG, JPEG, WEBP, DOC y DOCX válidos de menos de 3 MB.
- Rechaza ejecutables renombrados, extensiones/MIME discordantes y DOCX sin estructura Word.
- Descarga como adjunto con un perfil autorizado y comprueba la bitácora.
- Exporta valores que comiencen por fórmulas y ábrelos en Excel: deben quedar como texto.
- Inspecciona CSP, HSTS, `nosniff`, Referrer-Policy y Permissions-Policy en la respuesta real.
- Una mutación con `Origin` cruzado debe recibir 403; el mismo origen debe seguir funcionando.

## Dependencias conocidas al 2026-11-09

`npm audit --omit=dev` no reporta vulnerabilidades de producción. El audit completo conserva **4 alertas moderadas** en la cadena de desarrollo `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99). Afecta al servidor de desarrollo si se expone a sitios no confiables, no al bundle de producción. npm solo propone `drizzle-kit@0.18.1` mediante `--force`, un downgrade incompatible que no se aplicó. Revisar una corrección compatible a más tardar en la próxima actualización de Drizzle; mantener el servidor de desarrollo en localhost.

Las pruebas locales no sustituyen las comprobaciones contra Vercel/Neon reales ni pruebas de restauración, WAF, antivirus o MFA.
