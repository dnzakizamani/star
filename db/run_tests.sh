#!/usr/bin/env bash
# Rebuild the database from scratch and run every rule assertion.
#
#   ./db/run_tests.sh                       # uses local docker postgres container
#   PGHOST=... PGUSER=... ./db/run_tests.sh # or point at any scratch database
#
set -euo pipefail

DB="${TEST_DB:-star_gen_test}"
CONTAINER="${PG_CONTAINER:-postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_sql() {
    if [ -n "${PGHOST:-}" ]; then
        psql -v ON_ERROR_STOP=1 -q "$@"
    else
        docker exec -i "$CONTAINER" psql -U "${PGUSER:-root}" -d "$DB" -v ON_ERROR_STOP=1 -q "$@"
    fi
}

echo "==> Recreating database $DB"
if [ -n "${PGHOST:-}" ]; then
    psql -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
else
    docker exec "$CONTAINER" psql -U "${PGUSER:-root}" -d postgres \
        -c "drop database if exists $DB;" -c "create database $DB;"
fi

# Order matters: the auth stub must exist before the RLS policies reference auth.uid().
FILES=(
    00_extensions.sql
    01_schema.sql
    02_triggers.sql
    99_local_auth_stub.sql
    03_rls.sql
    04_seed.sql
    05_test_rules.sql
)

for f in "${FILES[@]}"; do
    echo "==> $f"
    if [ -n "${PGHOST:-}" ]; then
        psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/$f"
    else
        docker exec -i "$CONTAINER" psql -U "${PGUSER:-root}" -d "$DB" \
            -v ON_ERROR_STOP=1 -q -f /dev/stdin < "$HERE/$f"
    fi
done

echo
echo "==> All assertions passed."
