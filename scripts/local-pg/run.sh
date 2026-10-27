#!/usr/bin/env bash
# Ejecuta migraciones + seed + pruebas pgTAP contra un PostgreSQL local efímero (sin Docker).
# Requiere: binarios de PostgreSQL (initdb, pg_ctl), extensión pgTAP y pg_prove.
# Uso: scripts/local-pg/run.sh            → crea el clúster, aplica todo y ejecuta las pruebas
#      KEEP=1 scripts/local-pg/run.sh     → deja el servidor encendido al terminar (puerto $PGPORT)
# La vía oficial sigue siendo `supabase start && supabase db reset && supabase test db` (ver docs/setup.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PGPORT="${PGPORT:-54329}" PGHOST="${PGHOST:-/tmp}" PGUSER=postgres PGDATABASE=postgres
if [ -S "$PGHOST/.s.PGSQL.$PGPORT" ]; then
  echo "Ya hay un PostgreSQL escuchando en $PGHOST:$PGPORT (¿quedó uno con KEEP=1?). Deténlo o usa otro PGPORT." >&2
  exit 1
fi
DATA="$(mktemp -d)"
RUNAS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA" 2>/dev/null || { echo "Se necesita el usuario del sistema 'postgres' cuando se ejecuta como root"; exit 1; }
  RUNAS=(runuser -u postgres --)
fi
cleanup() { if [ -z "${KEEP:-}" ]; then "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DATA"; fi; }
trap cleanup EXIT

"${RUNAS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust --locale=C.UTF-8 >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PGPORT -k $PGHOST -c listen_addresses=''" -l "$DATA/server.log" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/scripts/local-pg/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
if [ -f "$ROOT/supabase/seed.sql" ]; then echo "→ seed.sql"; "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"; fi

echo "→ pruebas pgTAP"
pg_prove --ext .sql -r "$ROOT/supabase/tests/database"
