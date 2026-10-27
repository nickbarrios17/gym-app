# ADR 0004 — Timestamps UTC y fecha local

- Estado: aceptado · Fecha: 2026-10-27

## Decisión
- Todos los instantes son `timestamptz` (UTC).
- Las sesiones guardan además `time_zone` (IANA) y `local_date`, **calculada en el servidor al escribir**:
  `local_date = (started_at at time zone time_zone)::date`. La zona se toma de `user_preferences.time_zone`
  si el cliente no la indica, y se valida contra `pg_timezone_names`.
- Días de la semana: **0 = lunes … 6 = domingo** (igual que el prototipo: L M X J V S D), para
  `routines.schedule_days` y `user_preferences.week_start`.
- La hora del cliente (`p_client_ts`) se acepta para registrar sin conexión, con límites: no más de 5 min en el
  futuro ni más de 14 días en el pasado (`CLIENT_TS_OUT_OF_RANGE`); nunca posterior a `now()`.

## Consecuencias
- Cambiar de zona horaria no reescribe fechas pasadas: cada sesión conserva la fecha local de cuando ocurrió.
- `localDate()` en `@vida/domain` replica el cálculo (probado en cambios de horario y medianoche).
