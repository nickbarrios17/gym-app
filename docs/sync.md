# Protocolo de sincronización — fuente única de verdad

Versión 1 (Fase 3). Aplica a web, móvil y reloj.

## Principios
1. **Una sola base de datos autoritativa** (PostgreSQL en Supabase). Los dispositivos guardan cachés y una cola.
2. **UUID v4 generados por el cliente** para todas las filas sincronizadas (ADR 0002).
3. **Outbox**: las operaciones pendientes se guardan localmente y se marcan como confirmadas **solo** cuando el
   servidor responde con éxito. Implementación de referencia: `Outbox` en `@vida/api-client`.
4. **Atribución**: las sesiones y series llevan `device_id` cuando se conoce (`devices.register`).
5. **Realtime**: diferido; deshabilitado en `supabase/config.toml` hasta que se apruebe.

## Operaciones que se pueden encolar sin conexión (y solo estas)
| Operación | Garantía |
|---|---|
| `start_session` | idempotente por id; `ACTIVE_SESSION_EXISTS` si otra sesión está activa |
| `add_session_exercise` | idempotente por id |
| `record_set` | idempotente por id (series *append-only*) |
| `update_set` | idempotente en efecto (reaplicar el mismo patch deja la misma fila) |
| `delete_set` | borrado lógico; repetir es no-op |
| `transition_session` | estados monótonos; repetir la misma transición es no-op; terminales finales |

La hora del cliente se fija **al encolar** (`clientTs`) y el servidor la acepta dentro de [−14 días, +5 min].
Rutinas, perfil, preferencias y catálogo **no** se encolan en esta fase: requieren conexión.

## Vaciado de la cola
- FIFO, una operación a la vez.
- Error transitorio (`NETWORK_ERROR`, `RATE_LIMITED`) → se detiene y se reintenta más tarde (al volver la red,
  al abrir la app, con backoff).
- Error permanente (p. ej. `SESSION_CLOSED`, `ACTIVE_SESSION_EXISTS`, `VALIDATION_FAILED`) → la operación pasa a
  `failed` con su error, para mostrarla al usuario; el resto continúa. Las operaciones que dependían de ella
  fallarán a su vez con `NOT_FOUND`.
- Respuesta perdida (el servidor aplicó pero el cliente no lo supo) → el reenvío devuelve la fila existente.

## Resolución de conflictos
| Dato | Regla |
|---|---|
| Series | sin conflicto: cada serie es única por UUID; dos dispositivos pueden añadir series a la misma sesión |
| Estado de sesión | monótono: `in_progress ⇄ paused → completed/abandoned`; gana el primer estado terminal |
| Sesión activa | una por usuario (índice único parcial); el segundo dispositivo recibe `ACTIVE_SESSION_EXISTS` y debe **recuperar** la sesión activa (`sessions.active()`) |
| Rutinas | concurrencia optimista: `save_routine(payload, expected_version)` → `VERSION_CONFLICT` si cambió; el cliente recarga y pide al usuario resolver |
| Perfil, preferencias, notas/etiquetas de sesión | **última escritura gana** (aceptable: cambios pequeños de un mismo usuario, sin valor acumulativo) |
| Historial cerrado | inmutable salvo notas, etiquetas, nombre y borrado lógico |

## Lectura incremental (pull)
- `sync.pull(table, cursor)` devuelve filas con `(updated_at, id) > cursor`, en ese orden, **incluidas** las que
  tienen `deleted_at` (tombstones), para que el cliente borre su copia local.
- El cliente guarda el último cursor por tabla y aplica las filas con *upsert* por `id` (y descarta una fila si ya
  tiene una con `updated_at` mayor).
- **Ventana de seguridad**: `updated_at` se fija con la hora de inicio de la transacción; una transacción larga
  puede confirmarse con un `updated_at` anterior al cursor de otro cliente. Para no perder filas, el cliente debe
  pedir desde `cursor.updatedAt − 60 s` (sin id) y deduplicar por `id`. Es idempotente porque se aplica con upsert.
- Las tablas globales (catálogo del sistema, músculos, equipamiento, entitlements) se leen completas y se cachean.

## Recuperación de sesión entre dispositivos
Al abrir cualquier cliente: vaciar la outbox → `sessions.active()` → si existe, mostrar la sesión en curso con sus
series (de cualquier dispositivo). El reloj puede iniciar una sesión sin conexión con su propio UUID; si al
sincronizar ya había otra activa, recibe `ACTIVE_SESSION_EXISTS` y la UI debe ofrecer abandonar una de las dos.
