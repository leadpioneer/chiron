#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: RESTORE_CONFIRM=YES $0 backups/chiron-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

DUMP="$1"
if [ ! -f "$DUMP" ]; then
  echo "dump not found: $DUMP" >&2
  exit 1
fi

if [ "${RESTORE_CONFIRM:-}" != "YES" ]; then
  echo "refusing to restore without RESTORE_CONFIRM=YES" >&2
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-.env.staging}"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | sed 's/^"//; s/"$//'
}

POSTGRES_DB="${POSTGRES_DB:-$(read_env POSTGRES_DB)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env POSTGRES_USER)}"
POSTGRES_USER="${POSTGRES_USER:-chiron}"

if [ -z "$POSTGRES_DB" ]; then
  echo "POSTGRES_DB is not set in $ENV_FILE" >&2
  exit 1
fi

case "$POSTGRES_DB" in
  *_staging | chiron_test) ;;
  *)
    if [ "${ALLOW_PROD_RESTORE:-}" != "1" ]; then
      echo "refusing to restore into ${POSTGRES_DB:-unknown}; set ALLOW_PROD_RESTORE=1 for production" >&2
      exit 1
    fi
    ;;
esac

echo "restoring $DUMP into ${POSTGRES_DB}"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  pg_restore \
  --username="${POSTGRES_USER:-chiron}" \
  --dbname="${POSTGRES_DB}" \
  --clean --if-exists --no-owner --no-privileges < "$DUMP"

echo "restore completed"
