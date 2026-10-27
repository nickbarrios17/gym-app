# Puesta en marcha local

## Requisitos
- Node.js ≥ 20 (probado con 22) y npm.
- Docker (para Supabase local).
- Opcional: Deno 2 (pruebas de la Edge Function).

## Instalación
```bash
npm install
```

## Backend (vía oficial, con Docker)
```bash
npx supabase start          # Postgres, Auth, PostgREST, Mailpit (http://127.0.0.1:54324), Studio, Edge Runtime
npx supabase db reset       # aplica supabase/migrations/* y supabase/seed.sql
npx supabase test db        # pruebas pgTAP (supabase/tests/database)
npx supabase db lint        # lint del esquema
npm run db:types            # regenera packages/domain/src/db.types.ts con el generador oficial
npx supabase status         # muestra URL y claves locales para .env
```

## Backend sin Docker (lo que se usó en la sesión de construcción)
Requiere PostgreSQL ≥ 15 instalado localmente, la extensión pgTAP y `pg_prove`
(en Debian/Ubuntu: `apt-get install postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl`).
```bash
npm run db:test:local-pg    # clúster efímero + shim de Supabase + migraciones + seed + pgTAP
KEEP=1 scripts/local-pg/run.sh && PGHOST=/tmp PGPORT=54329 PGUSER=postgres node scripts/gen-db-types.mjs
```
El *shim* (`scripts/local-pg/supabase_shim.sql`) solo imita roles, `auth.users`, `auth.uid()` y privilegios por
defecto. **No sustituye** a Supabase: Auth, PostgREST y Edge Functions no se prueban por esta vía.

## Paquetes TypeScript
```bash
npm run typecheck
npm test                    # Vitest (domain + api-client, sin red)
VIDA_IT=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… MAILPIT_URL=http://127.0.0.1:54324 npm run test:integration
```

## Edge Function
```bash
deno test --allow-net --allow-env supabase/functions/delete-account/index.test.ts
npx supabase functions serve   # opcional; `supabase start` ya la sirve en local
```

## App actual (PWA)
Sin cambios: `node build.js` (o `npm run build:app`) genera `www/`; `./publish.sh` publica en GitHub Pages.
