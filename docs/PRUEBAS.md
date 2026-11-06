# Guía de pruebas

## Acceso y sesión

1. Entra con `admin.demo` y la contraseña demo indicada en el README.
2. Recarga la página: la sesión debe conservarse.
3. Cierra sesión: debe regresar al login y el API protegido debe responder 401.
4. Prueba una contraseña incorrecta: debe aparecer un error sin revelar si existe el usuario.

## Permisos

- `consulta.demo` puede leer, pero no crear expedientes ni calcular nóminas.
- `talento.demo` puede crear y actualizar expedientes.
- `nomina.demo` puede gestionar conceptos y nóminas, pero no pagos.
- `tesoreria.demo` registra pagos de nóminas cerradas.
- Solo el administrador general gestiona usuarios y cambia la validación jurídica.

## Flujo completo de nómina

1. Con Talento Humano, registra un expediente completamente ficticio.
2. Con Nómina, configura conceptos y calcula una nómina ordinaria.
3. Envíala a revisión.
4. Intenta aprobarla con la misma cuenta de Nómina: debe responder 403.
5. Inicia sesión con Aprobador y apruébala.
6. Con Nómina, cierra el ciclo.
7. Con Tesorería, registra una transferencia de prueba.
8. Repite exactamente el pago: debe indicar idempotencia y no duplicar el registro.
9. Verifica los recibos y la bitácora.

## Documentos

- Adjunta un PDF ficticio de menos de 3 MB.
- Confirma que el archivo aparece en el expediente.
- Descárgalo con un perfil autorizado.
- Sin sesión, la consulta del API debe permanecer protegida.

## Verificaciones realizadas sobre el paquete

- Comprobación estricta de TypeScript: correcta.
- Compilación de producción con Vite: correcta.
- Migración inicial PostgreSQL generada: 14 tablas, claves foráneas e índices.
- La variante Kimi de origen se comprobó en navegador con login, logout, contraseña inválida, permisos, aprobación independiente y pago idempotente.

La ejecución contra tu propia instancia Neon/Vercel requiere las credenciales que configuras durante el despliegue; no se incluye ninguna en este paquete.
