# ADR 0003 — Unidades canónicas

- Estado: aceptado · Fecha: 2026-10-27

## Decisión
- Internamente: **kilogramos, metros y segundos**. Columnas con sufijo explícito (`weight_kg`, `distance_m`,
  `duration_s`, `rest_s`, `height_m`, `paused_seconds`).
- Peso almacenado con 2 decimales (`numeric(6,2)`). Conversión exacta 1 lb = 0,45359237 kg.
- La conversión ocurre solo en el borde del cliente (`@vida/domain/units`):
  - Visualización: kg al 0,5; lb al entero (igual que la app actual).
  - Botones +/−: 2,5 kg o 5 lb. Redondeo «a discos»: múltiplos de 2,5 kg / 5 lb.
- La preferencia `user_preferences.weight_unit` (`kg|lb`) solo afecta a la presentación.

## Consecuencias
- Cualquier valor entero en lb sobrevive al viaje lb → kg → lb (probado de 0 a 2200 lb).
- Las métricas (volumen, e1RM) se calculan en kg y se convierten al mostrar.
