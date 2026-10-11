#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the SQL tests.
# Needs PostgreSQL 16 with PostGIS and pgvector installed.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pg_bin="${PG_BIN:-$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/16/bin)}"
work="$(mktemp -d)"
port="${PGTEST_PORT:-55432}"

cleanup() {
  "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$work/data" -U postgres --auth=trust >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/log" -o "-p $port -k $work -c listen_addresses=''" -w start >/dev/null

run_sql() {
  psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -h "$work" -p "$port" -U postgres -d postgres -f "$1"
}

run_sql "$here/tests/00_supabase_stubs.sql"
for f in "$here"/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  run_sql "$f"
done
for f in "$here"/tests/[1-9]*.sql; do
  echo "test: $(basename "$f")"
  run_sql "$f"
done
echo "all database tests passed"
