#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-.env.staging}"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

mkdir -p backups
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile backup run --rm backup

if [ -n "${RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "RCLONE_REMOTE is set but rclone is not installed" >&2
    exit 1
  fi
  rclone copy backups "$RCLONE_REMOTE" --include "chiron-*.dump" --min-age 0
  echo "backup copied to $RCLONE_REMOTE"
fi
