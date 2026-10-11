#!/usr/bin/env bash
# Throwaway Postgres for tests, with Supabase stand-ins and every migration applied.
#   ./supabase/test-db.sh start   # prints the connection URL
#   ./supabase/test-db.sh stop
# Needs PostgreSQL 16 with PostGIS and pgvector installed.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pg_bin="${PG_BIN:-/usr/lib/postgresql/16/bin}"
dir="${PGTEST_DIR:-${TMPDIR:-/tmp}/partynearme-testdb}"
port="${PGTEST_PORT:-55432}"

run_sql() {
  PGOPTIONS="-c client_min_messages=warning" psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$port" -U postgres -d postgres -f "$1"
}

case "${1:-}" in
  start)
    "$pg_bin/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$dir"
    mkdir -p "$dir"
    "$pg_bin/initdb" -D "$dir/data" -U postgres --auth=trust >/dev/null
    "$pg_bin/pg_ctl" -D "$dir/data" -l "$dir/log" -o "-p $port -k $dir -c listen_addresses=127.0.0.1" -w start >/dev/null
    run_sql "$here/tests/00_supabase_stubs.sql"
    for f in "$here"/migrations/*.sql; do
      echo "migration: $(basename "$f")" >&2
      run_sql "$f"
    done
    echo "postgres://postgres@127.0.0.1:$port/postgres"
    ;;
  stop)
    "$pg_bin/pg_ctl" -D "$dir/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$dir"
    ;;
  *)
    echo "usage: $0 start|stop" >&2
    exit 2
    ;;
esac
