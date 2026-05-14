#!/usr/bin/env bash
# =============================================================================
# Bootstrap an ephemeral Postgres, apply every Prisma migration, and run the
# integration test file against it. Cleans up regardless of test outcome.
#
# Skips silently if pg_ctl / psql aren't installed — the integration tests
# are opt-in and shouldn't block local dev without Postgres.
# =============================================================================
set -euo pipefail

if ! command -v psql >/dev/null || ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
  echo "Integration tests skipped: Postgres not installed."
  exit 0
fi

PG_BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -n1)
PGDATA="${PGDATA:-/var/lib/postgresql/it-scratch}"
PORT="${PG_PORT:-54331}"
DB="app_it"
SOCKET_DIR="/tmp"

cleanup() {
  if [ -d "$PGDATA" ]; then
    su - postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true
    rm -rf "$PGDATA"
  fi
}
trap cleanup EXIT

rm -rf "$PGDATA"
mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"

su - postgres -c "$PG_BIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null
su - postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l /tmp/pg-it.log -o '-p $PORT -k $SOCKET_DIR' start" >/dev/null

psql -h $SOCKET_DIR -p $PORT -U postgres -c "CREATE DATABASE $DB;" >/dev/null

# Apply each migration in lexical order — matches Prisma migrate's apply order.
for dir in $(ls -d prisma/migrations/*/ | sort); do
  psql -h $SOCKET_DIR -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -f "${dir}migration.sql" >/dev/null
done

export INTEGRATION_DATABASE_URL="postgresql://postgres@localhost:$PORT/$DB?host=$SOCKET_DIR"
# Run with `set +e` so a test failure doesn't skip the EXIT trap. Propagate
# the exit code at the end.
set +e
npx tsx --test tests/integration/db.test.ts
exit_code=$?
set -e
exit $exit_code
