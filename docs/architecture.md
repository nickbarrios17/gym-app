# Arquitectura — VIDA

## Visión general

```
 apps (Fase 5)          packages                      Supabase (un solo backend)
 ┌──────────────┐   ┌────────────────────┐   HTTPS   ┌──────────────────────────────────────┐
 │ web (Next)   │──▶│ @vida/api-client   │──────────▶│ Auth (GoTrue)  ── correo/contraseña   │
 │ móvil (Expo) │──▶│  supabase-js, Zod, │           │ PostgREST ── tablas/vistas/RPC (RLS)  │
 └──────────────┘   │  reintentos, outbox│           │ PostgreSQL ── public + private        │
 ┌──────────────┐   └─────────┬──────────┘           │ Edge Functions ── delete-account      │
 │ reloj Kotlin │── mismo contrato HTTP (docs/api.md)│ (service_role solo aquí)              │
 └──────────────┘   ┌─────────▼──────────┐           └──────────────────────────────────────┘
                    │ @vida/domain       │
                    │  Zod, tipos, lógica│
                    │  pura (sin red)    │
                    └────────────────────┘
```

- **Monolito modular** en PostgreSQL: dominios *cuenta*, *catálogo*, *rutinas*, *entrenamiento*, *métricas*.
- **`public`**: lo que expone la API (tablas con RLS, vistas `security_invoker`, RPC `SECURITY INVOKER`).
- **`private`**: helpers internos (triggers, validaciones, serializadores JSON). Sin acceso para `anon`.
- La única función `SECURITY DEFINER` es `private.handle_new_user()` (trigger de alta, `search_path` vacío,
  sin `EXECUTE` para clientes). Una prueba pgTAP falla si aparece cualquier `SECURITY DEFINER` en `public`.

## Reglas de seguridad

1. RLS activada en **todas** las tablas de `public` (comprobado por prueba).
2. Se revocan los privilegios por defecto de Supabase y se conceden solo los necesarios por tabla.
   `anon` no puede leer nada privado (solo el catálogo de entitlements).
3. Políticas con `(select auth.uid())` (evaluada una vez por consulta).
4. `prevent_owner_change` impide cambiar `user_id`/`owner_id` (`OWNER_IMMUTABLE`).
5. Claves foráneas **compuestas** `(id, user_id)` impiden colgar hijos propios de padres ajenos
   (rutina → ejercicios; sesión → ejercicios → series; dispositivo).
6. Las reglas de integridad viven en restricciones y triggers, no solo en las RPC: como las RPC son
   `SECURITY INVOKER`, el usuario podría escribir directamente en las tablas, y las mismas reglas se cumplen.
7. `service_role` solo en la Edge Function `delete-account` (variables de entorno del servidor).
8. Errores de dominio estandarizados (`SQLSTATE P0001`, `message = CÓDIGO`, `detail = texto seguro`);
   el cliente nunca propaga texto SQL.

## Modelo de datos (Fases 2–3)

| Tabla | Dueño | Notas |
|---|---|---|
| `profiles` | `user_id` (PK → `auth.users`, cascade) | nombre, año de nacimiento, altura (m), onboarding |
| `user_preferences` | `user_id` | `weight_unit kg|lb`, `locale`, `time_zone` IANA validada, `week_start` 0–6 |
| `devices` | `user_id` | `kind web|mobile|watch`, atribución de origen |
| `entitlements` | global | catálogo legible; sin escritura de clientes |
| `user_entitlements` | `user_id` | solo lectura propia; escribe `service_role` |
| `muscle_groups`, `equipment_types` | global | tablas de consulta (sembradas en migración) |
| `exercises` | `owner_id` NULL = sistema | slug único por dueño, JSONB de instrucciones y media, variación, archivado |
| `exercise_muscles`, `exercise_equipment` | vía ejercicio | escritura solo en ejercicios propios |
| `routines` | `user_id` | `schedule_days`, `version` (sube en cada cambio), archivado/borrado lógico |
| `routine_exercises` | `user_id` | posición única **diferible** (reordenar es seguro), objetivos, carga en kg |
| `workout_sessions` | `user_id` | estado, timestamps coherentes, pausas, `local_date`, energía **estimada**, borrado lógico |
| `workout_session_exercises` | `user_id` | **instantánea** de objetivos al iniciar; editar la rutina no cambia el historial |
| `workout_sets` | `user_id` | UUID del cliente, métricas con rangos, RPE en pasos de 0,5, borrado lógico |

Vistas (derivadas, no persistidas): `exercise_history` (volumen, e1RM de Epley, banderas de récord),
`personal_records`, `session_summaries` (duración neta de pausas, volumen, series).

### Comportamiento de borrado
- Borrar la cuenta (`auth.users`) elimina **todo** lo del usuario por `ON DELETE CASCADE`.
- Las FK hacia `exercises` desde rutinas y sesiones son **diferibles** (se comprueban al confirmar): así la
  cascada de borrado de cuenta funciona, y a la vez un ejercicio propio usado en el historial no se puede borrar
  (debe archivarse).
- Borrar un dispositivo o una rutina anula la referencia en el historial (`ON DELETE SET NULL (col)`).
- Los clientes no tienen `DELETE` sobre sesiones/series: borrado lógico con `deleted_at`.

### Máquina de estados de la sesión
`in_progress ⇄ paused → completed | abandoned`. Terminales finales; repetir la misma transición es un no-op.
Restricción `workout_sessions_status_timestamps` + trigger `workout_sessions_before_update` + RPC
`transition_session`; el mismo modelo en `@vida/domain/session-machine`. Índice único parcial: como máximo una
sesión activa por usuario. Series solo en sesiones abiertas (`SESSION_CLOSED`).

## Decisiones (ADR)
- [0001 Pila y monorepo](adr/0001-stack-y-monorepo.md)
- [0002 UUID del cliente](adr/0002-uuid-del-cliente.md)
- [0003 Unidades canónicas](adr/0003-unidades-canonicas.md)
- [0004 UTC y fecha local](adr/0004-tiempo-y-fecha-local.md)
- [0005 Sincronización](adr/0005-protocolo-de-sincronizacion.md)

## Desviaciones respecto al prompt maestro (para revisión)
- `exercises` añade `short_name`, `body_part` y `met` (los usa la app actual: nombre corto, filtro por zona y estimación de calorías).
- RPC adicional `add_session_exercise` (la app permite añadir ejercicios no planificados durante la sesión).
- `update_set`/`delete_set` también se rechazan en sesiones terminadas (el historial queda inmutable salvo notas,
  etiquetas, nombre y borrado lógico de la sesión).
- e1RM con 1 repetición = peso levantado (la app actual aplicaba `w·(1+1/30)`).
- `version` de rutina es un token monótono (puede subir más de 1 por guardado); el cliente debe usar el valor devuelto.
