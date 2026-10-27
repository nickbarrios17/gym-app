# ADR 0001 — Pila tecnológica y estructura de monorepo

- Estado: aceptado (Fases 1–3) · Fecha: 2026-10-27

## Contexto
VIDA tendrá web, móvil y reloj con un único backend. El repositorio ya contiene una PWA sin compilación
(«Gym App») que debe seguir funcionando.

## Decisión
- Backend: **Supabase** (PostgreSQL, Auth, RLS, Edge Functions) con migraciones SQL versionadas.
- **Monolito modular**: un esquema `public` (expuesto por PostgREST) y un esquema `private` para helpers internos.
- **npm workspaces** en la raíz: `packages/domain` (Zod, tipos, lógica pura) y `packages/api-client` (supabase-js).
  La PWA actual permanece en la raíz y conserva sus dependencias y su `build.js`.
- TypeScript + Zod + Vitest; Deno para Edge Functions; GitHub Actions para CI.
- Clientes futuros (Fase 5): Next.js (`apps/web`), Expo (`apps/mobile`), Kotlin/Compose (`apps/watch`). No se crean ahora.

## Consecuencias
- Un solo modelo de datos para todos los clientes. El reloj nativo no comparte código TS; consume el mismo contrato (docs/api.md).
- La raíz mezcla temporalmente la PWA y el monorepo; se ordenará al crear `apps/` en la Fase 5.
