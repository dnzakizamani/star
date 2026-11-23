#!/usr/bin/env bash
# Run a SQL file (or inline SQL) against the Supabase database.
#
#   ./db/supabase.sh 01_schema.sql
#   ./db/supabase.sh -c "select 1"
#
# Uses the session pooler because the direct host is IPv6-only.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../.env.db"

if [ ! -f "$ENV_FILE" ]; then
    echo "missing $ENV_FILE" >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

CONN="host=$SUPABASE_DB_HOST port=$SUPABASE_DB_PORT user=$SUPABASE_DB_USER dbname=$SUPABASE_DB_NAME sslmode=require"

exec docker run --rm -i \
    -e "PGPASSWORD=$SUPABASE_DB_PASSWORD" \
    -v "$HERE:/sql:ro" \
    postgres:17 \
    psql "$CONN" "$@"
