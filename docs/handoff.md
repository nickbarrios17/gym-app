# Entrega para revisión — Fases 1–3

Fecha: 27-oct-2026. **Trabajo detenido tras la Fase 3, a la espera de revisión.** No se ha iniciado ninguna fase posterior.

## 1. Qué se implementó y qué archivos se tocaron

**Modificados:** `.gitignore` (secretos, artefactos; `design/` sigue ignorado salvo `prototypes/` y `reference/`),
`package.json` (workspaces, scripts y devDependencies; las dependencias de la app actual siguen iguales), `package-lock.json`.
La app actual (`app.js`, `index.html`, `nocturne.css`, `mannequin.js`, `vendor/`, `sync-backend/`…) **no se modificó**;
`node build.js` sigue funcionando sin cambios en archivos versionados.

**Creados:**
- Fase 1 — `docs/audit.md`, `docs/architecture.md`, `docs/api.md`, `docs/sync.md`, `docs/env.md`, `docs/setup.md`,
  `docs/adr/0001…0005`, `design/reference/VIDA_Prompt_Maestro_Unificado.md`, `design/prototypes/README.md`, `.env.example`.
- Fase 2 — `supabase/config.toml` (contraseñas ≥ 8 con letras y números, Mailpit, Realtime desactivado, `verify_jwt` en la función),
  `supabase/migrations/20261027000100_foundation.sql`, `supabase/seed.sql`, `supabase/functions/delete-account/{index.ts, index.test.ts, deno.json, deno.lock}`,
  `packages/domain/src/db.types.ts`, `scripts/gen-db-types.mjs`.
- Fase 3 — migraciones `…0200_exercise_catalog.sql`, `…0300_routines.sql`, `…0400_workouts.sql`, `…0500_views_and_export.sql`;
  `packages/domain/**` (errores, ids, unidades, métricas, fechas, máquina de estados, esquemas Zod, pruebas);
  `packages/api-client/**` (cliente, errores, reintentos, outbox, pruebas unitarias e integración).
- Pruebas e infraestructura — `supabase/tests/database/000…060*.test.sql`, `scripts/local-pg/{run.sh, supabase_shim.sql}`,
  `.github/workflows/ci.yml`, `tsconfig.base.json`.

## 2. Qué se verificó (comandos reales y resultados)

| Comando | Resultado |
|---|---|
| `scripts/local-pg/run.sh` (PostgreSQL 16.15 nativo + shim de Supabase + pgTAP) | 5 migraciones y seed aplicadas sin errores; **148/148 pruebas pgTAP OK** (7 archivos) |
| `npm run typecheck` | OK (domain y api-client) |
| `npm test` | **64/64 OK** — domain 40, api-client 24 |
| `deno check` + `deno test --allow-net --allow-env supabase/functions/delete-account/index.test.ts` (Deno 2.5.4) | **6/6 OK** (contra un servidor Auth simulado) |
| `node scripts/gen-db-types.mjs` | 15 tablas, 3 vistas, 10 funciones |
| `node build.js` | la PWA actual se genera igual; sin cambios en archivos versionados |

Errores reales que las pruebas detectaron y se corrigieron durante la construcción:
- `start_session` comprobaba la sesión activa antes de validar la hora del cliente → se reordenó.
- El borrado de cuenta fallaba si el usuario tenía un ejercicio propio usado en una rutina (la FK se comprobaba a
  mitad de la cascada) → FKs hacia `exercises` **diferibles**; las pruebas fuerzan `set constraints all immediate`
  para que la comprobación no se salte con el `rollback`.

## 3. Qué NO se probó y por qué

- **`supabase start`, `supabase db reset`, `supabase test db`, `supabase db lint`, `supabase gen types`**: Docker
  arranca, pero no puede descargar imágenes (Amazon ECR: «Data limit exceeded»; Docker Hub: 429). Por eso:
  - pgTAP se ejecutó en PostgreSQL **16** con un *shim* (la configuración de Supabase usa PostgreSQL **17**).
  - `db.types.ts` se generó con un generador de respaldo propio leyendo el esquema real, no con el oficial.
- **Pruebas de integración del api-client** (`test/integration/flow.integration.test.ts`: dos usuarios, auth,
  recuperación por Mailpit, flujo de entrenamiento con reintentos, outbox offline real, exportación, borrado de
  cuenta): escritas, **no ejecutadas** (6 omitidas). Necesitan Auth/PostgREST/Edge Runtime reales.
- **La Edge Function contra Supabase real**: solo probada con un Auth simulado.
- **CI de GitHub Actions**: el workflow existe, **nunca se ha ejecutado**. Los nombres de variables de
  `supabase status -o env` (`API_URL`, `ANON_KEY`, `INBUCKET_URL`/`MAILPIT_URL`) deben confirmarse en la primera ejecución.
- **Plantilla de correo de recuperación**: la prueba de integración extrae `token=` del enlace; depende de la plantilla por defecto de la versión de la CLI.

## 4. Problemas de seguridad / integridad sin resolver

- Ninguno crítico conocido en lo implementado. Observaciones:
  - Las vistas de récords usan subconsultas correlacionadas (O(n²) por usuario y ejercicio). Correcto, pero habrá que
    optimizarlas (ventanas o tabla materializada) cuando el historial crezca.
  - La búsqueda de ejercicios no ignora tildes (la app actual sí). Requiere `unaccent` + índice (pendiente).
  - El cursor de sincronización necesita la ventana de seguridad documentada en `docs/sync.md` (el cliente debe aplicarla).
- Fuera del alcance pero importante: el servidor de sincronización Apps Script actual es anónimo con código
  compartido (ver `docs/audit.md`, R3). El catálogo externo tiene licencia sin verificar (R2).

## 5. Decisiones y supuestos para revisar

1. Se trabajó sobre el repositorio existente `gym-app` (no una carpeta vacía) y la PWA convive con el monorepo.
2. Desviaciones del prompt maestro: columnas `short_name`, `body_part`, `met` en `exercises`; RPC extra
   `add_session_exercise`; series de sesiones terminadas inmutables (`update_set`/`delete_set` también rechazados);
   e1RM con 1 repetición = peso; `version` de rutina monótona (no siempre +1). Detalle en `docs/architecture.md`.
3. Roles musculares de los 5 ejercicios: «primary» = activación 1 en `mannequin.js`; el resto de la ficha = «secondary».
   Sin descripción (el prototipo no la tiene).
4. Entitlement de ejemplo `vida_plus` solo en `seed.sql` (desarrollo).
5. Energía: la estima el cliente (necesita peso corporal, que llega en Fase 4) y se guarda con `energy_is_estimated = true`.
6. Validación de hora del cliente: ventana [−14 días, +5 min].
7. **Commits**: el prompt maestro pide no hacer commits sin permiso explícito, así que **todo está sin confirmar** en la
   rama `claude/beautiful-clarke-yui3xh`. El contenedor de esta sesión es efímero: si no se hace commit y push, el
   trabajo se pierde cuando se recicle.

## 6. Backlog restante (no iniciado)

- **Fase 4**: nutrición (alimentos, recetas, comidas, calorías, macros), hábitos (definiciones, calendario, registros),
  medidas corporales (incl. peso corporal para estimaciones), objetivos e historiales.
- **Fase 5**: `apps/web` (Next.js), `apps/mobile` (Expo), `apps/watch` (Kotlin/Compose Wear OS); paquete de tokens desde
  Nocturne; sustituir datos simulados conservando el diseño y los estados de carga/vacío/error/éxito; **importador de
  `localStorage`** y retirada del servidor Apps Script; importar los prototipos `.dc.html`.
- **Fase 6**: observaciones de salud, resúmenes diarios, Health Connect, HealthKit, Wear OS Health Services, offline ampliado.
- **Fase 7**: VIDA Intelligence, proveedor de suscripciones y pagos, endurecimiento de despliegue, preparación del lanzamiento.
- Pendientes técnicos: búsqueda sin tildes, optimización de vistas de récords, generar tipos con el generador oficial,
  primera ejecución de CI.

## 7. Comandos exactos

```bash
npm install
# Con Docker:
npx supabase start && npx supabase db reset && npx supabase test db && npx supabase db lint
npm run db:types
npm run typecheck && npm test
eval "$(npx supabase status -o env | sed 's/^/export /')"
VIDA_IT=1 SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" MAILPIT_URL=http://127.0.0.1:54324 npm run test:integration
deno test --allow-net --allow-env supabase/functions/delete-account/index.test.ts
# Sin Docker (PostgreSQL + pgTAP + pg_prove locales):
npm run db:test:local-pg
```
