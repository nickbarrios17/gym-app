# Auditoría inicial — VIDA (Fase 1)

Fecha: 27-oct-2026 · Repositorio: `nickbarrios17/gym-app` · Rama de trabajo: `claude/beautiful-clarke-yui3xh`

## 1. Qué existe y qué se inspeccionó

**El estado real no coincide con las notas de planificación.** Las notas describían una carpeta local vacía
(`C:\Users\nicol\Desktop\Proyectos personales\VIDA HEALT`) y cuatro prototipos `.dc.html`. Lo que hay es un
repositorio Git con una **aplicación web funcional («Gym App»)** y dos commits (26-oct-2026):

| Ruta | Qué es |
|---|---|
| `index.html`, `app.js` (878 líneas), `app.css` | PWA en React 18 (UMD) + `htm`, sin paso de compilación. Toda la lógica y la UI en un archivo. |
| `nocturne.css` | Tokens y clases del sistema de diseño «Nocturne» (comentario: «importado de Claude Design»). |
| `mannequin.js` | Web component `<gym-mannequin>` con Three.js 0.149: técnica 3D animada de 5 ejercicios. |
| `merge.js` | Fusión de dos copias de los datos (LWW por campo y por elemento, tombstones). Se copia al servidor como `Merge.gs`. |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Service worker (red primero, caché sin conexión) y manifiesto PWA. |
| `vendor/` | React, ReactDOM, htm, three, iconos Phosphor (copiados de `node_modules` por `build.js`). |
| `build.js`, `publish.sh` | Genera `www/` (web o APK) y publica en GitHub Pages con *force push* a `gh-pages`. |
| `sync-backend/` (`Code.gs`, `Merge.gs`, `appsscript.json`) | Servidor de sincronización en Google Apps Script. |

Se leyeron todos los archivos de código, configuración y el historial de Git. Los prototipos de Claude Design,
`support.js`, `VIDA Intelligence (Copy).md` y el código previo Kotlin/Supabase **no están disponibles**: no
estaban en el repositorio ni entre los archivos subidos (solo se subió el prompt maestro, ahora en
`design/reference/`). No hay acceso a la herramienta de diseño desde esta sesión. `nocturne.css` y
`mannequin.js` sí existen, pero son las versiones integradas en la app; no se puede confirmar si son idénticas
a las del proyecto de diseño.

## 2. Simulado frente a implementado

**Implementado en el cliente (funciona hoy):** rutinas con días (L–D), sesión en vivo con temporizador de
descanso (90 s), registro de series en tabla, resumen con volumen y récords, historial, progreso semanal,
calorías estimadas por MET, notas/etiquetas, biblioteca con catálogo externo, ficha técnica con maniquí 3D,
unidades kg/lb, diseño de escritorio.

**Persistencia y servidor actuales:**
- Todo se guarda en `localStorage` (`gymapp-v1`): `profile {name, kg, age}`, `units`, `routines[{id, name, days, items[{exId, sets, reps}]}]`,
  `history`, `session`, `summary`, `meta` (marcas de tiempo LWW) y `deleted` (tombstones).
- La «sincronización» envía **el conjunto completo de datos** a un Apps Script, que lo guarda comprimido en
  Script Properties (límite ~500 KB) y lo fusiona con `gymMerge`.
- **No hay cuentas, ni autenticación por usuario, ni validación en servidor, ni base de datos.**

**Simulado / limitado:** las calorías son estimaciones (MET × peso corporal); no hay datos de salud reales;
no hay reloj ni app nativa; el catálogo amplio se descarga en tiempo de ejecución de un tercero.

## 3. Qué requiere persistencia, lógica de servidor o integraciones

- Cuentas, perfil y preferencias → Supabase Auth + `profiles`/`user_preferences` (**hecho en Fase 2**).
- Rutinas, sesiones, series, historial y récords → tablas + RPC idempotentes + vistas (**hecho en Fase 3**).
- Sincronización entre dispositivos y sesión recuperable → UUID del cliente, outbox, cursores (**contrato y cliente hechos**).
- Exportación y borrado de cuenta → RPC + Edge Function (**hecho**).
- Importación de los datos de `localStorage` del usuario actual → **pendiente (Fase 5)**, ver riesgos.
- Nutrición, hábitos, medidas corporales, Health Connect/HealthKit, Wear OS, pagos → fases 4–7.

## 4. Qué se debe conservar

- El texto en español y el tono de la app; los estados vacíos que no inventan datos.
- Los tokens de **Nocturne** (`nocturne.css`) como base del futuro paquete de tokens.
- El contenido técnico de los 5 ejercicios (claves, errores, respiración, tempo) — **ya sembrado tal cual** en la base de datos.
- El maniquí 3D (`mannequin.js`) y su mapa de activación muscular.
- Las reglas de uso: incrementos de 2,5 kg / 5 lb, visualización al 0,5 kg / 1 lb, semana de lunes a domingo,
  regla de «mejor serie» (más peso; a igual peso, más repeticiones).
- La app actual sigue funcionando sin cambios: `node build.js` produce el mismo resultado (verificado).

## 5. Riesgos, información faltante y conflictos

| # | Riesgo | Impacto | Recomendación |
|---|---|---|---|
| R1 | **Prototipos `.dc.html` ausentes.** | No se puede verificar el diseño objetivo de Web v2 / Health v2 / Watch v2. | Importarlos a `design/prototypes/` antes de la Fase 5. |
| R2 | **Licencia del catálogo externo** (`JahelCuadrado/ExerciseGymGifsDB@v1.1.0`, servido por jsDelivr): textos y GIF de terceros sin licencia verificada. | Bloqueante para un producto comercial. | No se importó a la base de datos. Verificar licencia o sustituir por contenido propio/licenciado. |
| R3 | **Sincronización Apps Script**: endpoint anónimo (`ANYONE_ANONYMOUS`), un único código compartido, y el *primer* código recibido queda registrado (quien llame primero «reclama» el servidor). El código va dentro del APK. Sin cuentas. | Seguridad y privacidad débiles; no escala. | Sustituir por Supabase en la Fase 5 y retirar el servidor tras migrar los datos. |
| R4 | **Migración de datos locales**: `history` usa claves de ejercicio del prototipo (`sentadilla`, …) y `cat:<id>` del catálogo externo. | Pérdida de historial si se migra mal. | Importador en Fase 5: slugs → ejercicios del sistema (mismos slugs); `cat:*` → ejercicios propios con el nombre guardado en `names`. |
| R5 | `publish.sh` hace *force push* a `gh-pages`. | Sobrescribe la rama de publicación. | Aceptable para Pages; documentado. |
| R6 | Las calorías necesitan el peso corporal (`profile.kg`), que según el plan pertenece a «medidas corporales» (Fase 4). | La estimación no puede hacerse en servidor aún. | El cliente estima y envía `energy_kcal` con `energy_is_estimated = true`. |
| R7 | Pila objetivo (Next.js / Expo / Kotlin) frente a la PWA sin compilación actual. | Reescritura futura. | No se reescribe nada en Fases 1–3; la PWA convive con el monorepo. |
| R8 | Datos de salud sensibles; obligaciones legales según el mercado (p. ej. RGPD en UE, leyes de datos personales en Argentina/LatAm). | Legal. | Minimización, exportación y borrado ya implementados; revisión legal antes del lanzamiento (no se afirma cumplimiento). |
| R9 | Entorno de esta sesión: Docker no puede descargar imágenes (límite del registro). | `supabase start` no se pudo ejecutar. | Pruebas SQL ejecutadas en PostgreSQL 16 nativo con un *shim* de Supabase; CI ejecuta la vía oficial. |

## 6. Mapeo de prototipos a aplicaciones de producción

| Origen | Destino previsto (Fase 5) |
|---|---|
| App actual (PWA «Gym App») | Referencia funcional; sigue publicada hasta que exista la app web/móvil. Fuente de la migración de datos. |
| `VIDA Web v2` (no disponible) | `apps/web` — Next.js + React + TypeScript |
| `VIDA Health v2` (móvil, no disponible) | `apps/mobile` — Expo + React Native |
| `VIDA Watch v2` (no disponible) | `apps/watch` — Kotlin + Jetpack Compose for Wear OS (+ Health Services) |
| `VIDA Sistema de diseño` / `nocturne.css` | `packages/design-tokens` (derivado de Nocturne) |
| `mannequin.js` | Componente web reutilizable en `apps/web`; en móvil, WebView o reimplementación |
| `sync-backend/` | Se retira tras migrar a Supabase |

## 7. Plan mínimo y seguro (ejecutado en esta sesión)

1. **Fase 1**: auditoría, documentación, ADRs, `.gitignore`, referencia de diseño. Sin tocar la app.
2. **Fase 2**: Supabase (config, migraciones), helpers, perfiles, preferencias, dispositivos, entitlements, RLS,
   exportación, Edge Function de borrado, errores estándar, tipos.
3. **Fase 3**: catálogo, rutinas, sesiones/series con RPC idempotentes, vistas derivadas, `packages/domain`,
   `packages/api-client`, protocolo de sincronización.
4. Parar y entregar (`docs/handoff.md`).
