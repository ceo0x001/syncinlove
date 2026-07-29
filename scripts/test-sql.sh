#!/usr/bin/env bash
#
# Runs the Phase 1 SQL against a throwaway local Postgres cluster.
#
#   npm run test:sql
#
# Nothing here touches your Supabase project. It creates a disposable cluster in
# a temp directory, stubs out the handful of Supabase-specific things the
# migration depends on (the auth schema, auth.uid(), the authenticated role),
# applies the real migration and seed unmodified, then asserts its way through
# the whole loop — pairing, the 30-hour window, immutability, the score, and RLS
# from a genuine non-owner role.
#
# That last part is the reason this exists. "A partner cannot read your answer"
# is the load-bearing promise of the product, and the only way to know it holds
# is to connect as somebody who isn't the table owner and try.
#
# Requires postgres on PATH (brew install postgresql@16).

set -euo pipefail

PORT="${SYNC_TEST_PGPORT:-55432}"
WORKDIR="$(mktemp -d)"
DATADIR="$WORKDIR/pgdata"

# Homebrew keeps versioned binaries out of the default PATH.
for candidate in /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin; do
  [ -d "$candidate" ] && PATH="$candidate:$PATH"
done
export PATH

# Postgres refuses to start on macOS without a valid locale, and the failure
# message ("postmaster became multithreaded") does not say so.
export LC_ALL=C LANG=C

if ! command -v initdb >/dev/null 2>&1; then
  echo "postgres not found on PATH. Install it with: brew install postgresql@16" >&2
  exit 1
fi

cleanup() {
  pg_ctl -D "$DATADIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "→ starting a throwaway cluster on port $PORT"
initdb -D "$DATADIR" -U postgres --auth=trust --locale=C >/dev/null

# TCP only. A unix socket path under a temp dir routinely exceeds the 103-byte
# limit and fails with a message that points nowhere useful.
pg_ctl -D "$DATADIR" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$WORKDIR/pg.log" start >/dev/null

for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p "$PORT" -q && break
  sleep 0.3
done

psql -h 127.0.0.1 -p "$PORT" -U postgres -q -c "create database sync_test"

run() {
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d sync_test -v ON_ERROR_STOP=1 "$@"
}

echo "→ applying stubs, migration and seed"
run -q -f supabase/tests/_supabase_stubs.sql >/dev/null
run -q -f supabase/migrations/0001_phase1_loop.sql 2>&1 | grep -v 'does not exist, skipping' || true
run -q -f supabase/seed/questions.sql >/dev/null

echo "→ running assertions"
echo
if run -f supabase/tests/phase1_flow.sql 2>&1 \
  | grep -E 'NOTICE:  ok|ERROR|FAILED|ALL SQL' \
  | sed -E 's/^psql:[^ ]+ //; s/NOTICE:  //'; then
  echo
else
  echo "SQL tests failed" >&2
  exit 1
fi
