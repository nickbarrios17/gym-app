# Variables de entorno

Solo nombres; los valores nunca se versionan. Copia `.env.example` a `.env` (ignorado por Git).

| Variable | Dónde | Secreto | Uso |
|---|---|---|---|
| `SUPABASE_URL` | clientes, funciones, pruebas | no | URL del proyecto (local: `http://127.0.0.1:54321`) |
| `SUPABASE_ANON_KEY` | clientes, funciones, pruebas | no (pública por diseño) | clave del cliente; la RLS protege los datos |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo** Edge Functions / procesos de confianza | **sí** | `delete-account`; jamás en apps, navegador, repositorio ni logs |
| `VIDA_IT` | pruebas | no | `1` activa las pruebas de integración del api-client |
| `MAILPIT_URL` | pruebas | no | API de Mailpit para leer correos de recuperación (local: `http://127.0.0.1:54324`) |

En Supabase (local y alojado), `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` se inyectan
automáticamente en las Edge Functions.

La app actual (PWA) usa además `sync.local.json` (no versionado) para el servidor Apps Script; se retirará en la Fase 5.
