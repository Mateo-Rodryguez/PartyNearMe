#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the SQL tests.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
trap '"$here/test-db.sh" stop' EXIT

url="$("$here/test-db.sh" start)"
for f in "$here"/tests/[1-9]*.sql; do
  echo "test: $(basename "$f")"
  psql -X -q -o /dev/null -v ON_ERROR_STOP=1 "$url" -f "$f"
done
echo "all database tests passed"
