# ADR 0002 — UUID v4 generados por el cliente

- Estado: aceptado · Fecha: 2026-10-27

## Contexto
El reloj y el móvil deben registrar entrenamientos con mala conexión y reintentar sin duplicar.

## Decisión
- Las filas sincronizadas (`devices`, `routines`, `routine_exercises`, `workout_sessions`,
  `workout_session_exercises`, `workout_sets`, `exercises` propios) usan **UUID v4 generados por el cliente**
  (`newId()` en `@vida/domain`). `workout_sets.id` no tiene valor por defecto: el cliente **debe** generarlo.
- Las RPC son **idempotentes por id**: `start_session`, `record_set`, `add_session_exercise`, `duplicate_routine(p_new_id)`
  devuelven la fila existente si se reintenta con el mismo id; `delete_set` y las transiciones repetidas son no-ops.
- Un id reutilizado para otro propósito devuelve `ID_CONFLICT`. Un id de otro usuario no revela información
  (la RLS lo oculta; el resultado es `NOT_FOUND`/`ID_CONFLICT`).

## Consecuencias
- Reintentos seguros con backoff y una cola offline sencilla (docs/sync.md).
- Requiere `crypto.randomUUID` (o un polyfill en React Native); el reloj usa `java.util.UUID.randomUUID()`.
