# Contrato de la API — VIDA (Fases 2–3)

Todas las llamadas pasan por Supabase (PostgREST en `/rest/v1`, Auth en `/auth/v1`, funciones en `/functions/v1`).
Los clientes TypeScript usan `@vida/api-client`; el reloj Kotlin usa los mismos endpoints HTTP.

## Errores
Formato estándar `{ code, message }`. En la base de datos: `SQLSTATE P0001`, `message` = código, `details` = texto.

| Código | Cuándo |
|---|---|
| `NOT_AUTHENTICATED` | sin sesión o JWT inválido |
| `FORBIDDEN` | privilegio o RLS (42501) |
| `NOT_FOUND` | no existe o no es visible para el usuario |
| `VALIDATION_FAILED` | entrada inválida (Zod, CHECK, tipos) |
| `CONFLICT` | unicidad (23505) |
| `VERSION_CONFLICT` | `save_routine` con versión obsoleta |
| `ID_CONFLICT` | UUID reutilizado para otra cosa |
| `ACTIVE_SESSION_EXISTS` | ya hay una sesión en curso/pausada |
| `SESSION_CLOSED` | escribir series en una sesión terminada |
| `INVALID_TRANSITION` | transición de estado no permitida |
| `IMMUTABLE_FIELD`, `OWNER_IMMUTABLE` | intento de cambiar campos fijos o el dueño |
| `INVALID_TIME_ZONE`, `CLIENT_TS_OUT_OF_RANGE`, `EXERCISE_NOT_FOUND` | validaciones específicas |
| `NETWORK_ERROR`, `RATE_LIMITED` | transitorios (reintentables) |

## Autenticación (`client.auth`)
`signUp({email, password, displayName?, timeZone?, locale?})` · `signIn` · `signOut` ·
`requestPasswordReset(email, redirectTo?)` (correo a Mailpit en local) · `verifyRecoveryLink(tokenHash)` ·
`exchangeCodeForSession(code)` · `updatePassword(newPassword)` · `currentUserId()` · `onChange(cb)`.
Contraseña: ≥ 8 caracteres con letras y números (también en `supabase/config.toml`).

## Perfil, preferencias, dispositivos
| Cliente | Servidor |
|---|---|
| `profile.get()` / `profile.update(patch)` | `profiles` (select/update propio) |
| `preferences.get()` / `preferences.update(patch)` | `user_preferences` (zona horaria validada) |
| `devices.register({id, kind, platform?, label?})` | upsert idempotente en `devices` |
| `devices.list()` / `devices.remove(id)` | `devices` |

## Catálogo
| Cliente | Servidor |
|---|---|
| `exercises.search({query?, bodyPart?, equipment?, muscle?, scope?, limit?, cursor?})` | `exercises`, paginación por `(name, id)` |
| `exercises.get(id)` / `exercises.details(id)` | ejercicio + músculos + equipamiento |
| `exercises.create(input)` / `exercises.archive(id)` | solo ejercicios propios |

## Rutinas
| RPC / tabla | Firma | Notas |
|---|---|---|
| `save_routine` | `(p_payload jsonb, p_expected_version int = null) → jsonb` | crea (versión null) o reemplaza cabecera + ejercicios de forma atómica; `VERSION_CONFLICT` si la versión no coincide |
| `duplicate_routine` | `(p_id uuid, p_new_id uuid = null) → jsonb` | idempotente con `p_new_id` |
| `routines` | update `archived_at` / `deleted_at` | archivado y borrado lógico |

Payload: `{ id, name, notes?, schedule_days: [0–6], items: [{ id?, exercise_id, target_sets, rep_min?, rep_max?, target_rest_s?, target_load_kg?, notes? }] }`
(el orden del array define `position`).

## Sesiones y series (idempotentes)
| RPC | Firma |
|---|---|
| `start_session` | `(p_id, p_routine_id = null, p_device_id = null, p_client_ts = null, p_name = null) → sesión + ejercicios` |
| `add_session_exercise` | `(p_id, p_session_id, p_exercise_id, p_target_sets = null) → ejercicio de sesión` |
| `record_set` | `(p_id, p_session_exercise_id, p_set_index, p_weight_kg?, p_reps?, p_duration_s?, p_distance_m?, p_rpe?, p_rest_s?, p_set_type = 'working', p_completed_at?, p_client_ts?, p_device_id?) → serie` |
| `update_set` | `(p_id, p_patch jsonb) → serie` — claves permitidas: `set_index, set_type, weight_kg, reps, duration_s, distance_m, rpe, rest_s, completed_at` |
| `delete_set` | `(p_id) → serie` (borrado lógico; repetir es no-op) |
| `transition_session` | `(p_id, p_action pause|resume|complete|abandon, p_client_ts = null, p_energy_kcal = null) → sesión` |

Directo en tabla: `workout_sessions` → `notes`, `tags`, `name`, `deleted_at` (solo terminadas).

## Historial y métricas
`history.exercise(exerciseId)` → `exercise_history` · `history.personalRecords()` → `personal_records` ·
`sessions.list({limit, before})` → `session_summaries` · `sessions.active()` · `sessions.get(id)`.

## Cuenta
| Cliente | Servidor |
|---|---|
| `account.exportData()` | RPC `export_my_data() → jsonb` (`format: "vida-export"`, `format_version: 1`) |
| `account.deleteAccount()` | `POST /functions/v1/delete-account` con `{ "confirm": true }` y el JWT del usuario |

## Sincronización
`sync.pull(table, cursor?, limit?)` — ver docs/sync.md. Tablas: `devices, exercises (propios), routines,
routine_exercises, workout_sessions, workout_session_exercises, workout_sets`.

## Reintentos
`@vida/api-client` reintenta con backoff exponencial + jitter **solo** operaciones idempotentes (RPC con UUID del
cliente y lecturas) y solo ante `NETWORK_ERROR`/`RATE_LIMITED`. Nunca reintenta `signUp`, `signIn`, `save_routine`
ni escrituras directas.
