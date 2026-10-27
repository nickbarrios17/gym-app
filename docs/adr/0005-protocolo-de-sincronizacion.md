# ADR 0005 — Protocolo inicial de sincronización y resolución de conflictos

- Estado: aceptado (versión inicial) · Fecha: 2026-10-27

## Decisión
Resumen; la fuente de verdad es `docs/sync.md`.
- Una sola base de datos autoritativa (PostgreSQL). Los clientes mantienen cachés y una **outbox**.
- Escrituras de entrenamiento: RPC idempotentes con UUID del cliente; series *append-only* (se corrigen con
  `update_set` y se borran de forma lógica); estados de sesión **monótonos** (terminales finales).
- Rutinas: concurrencia optimista con `version` (`VERSION_CONFLICT` si está obsoleta).
- Perfil/preferencias/notas: **última escritura gana** (cambios pequeños, de un solo usuario).
- Lectura incremental por cursor `(updated_at, id)` con tombstones `deleted_at`.
- Realtime diferido.

## Consecuencias
- Sin CRDT ni fusión compleja; los conflictos reales (rutina editada en dos dispositivos) se muestran al usuario.
- Sustituye la fusión «blob completo + LWW» del servidor Apps Script actual.
