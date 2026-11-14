#!/usr/bin/env bash
# Backs up the Postgres database and MinIO buckets from the docker-compose
# stack into timestamped local files, then prunes anything older than
# RETENTION_DAYS. Run from anywhere; it locates docker-compose.yml relative
# to this script.
set -euo pipefail

# Locate the compose project: $COMPOSE_DIR if set; else the script's parent
# dir if it holds a docker-compose.yml (the VPS layout, scripts/ installed
# next to the compose file); else <repo>/homelab (this repo's checkout).
if [ -z "${COMPOSE_DIR:-}" ]; then
  _parent="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [ -f "$_parent/docker-compose.yml" ]; then
    COMPOSE_DIR="$_parent"
  else
    COMPOSE_DIR="$_parent/homelab"
  fi
fi
if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
  echo "No docker-compose.yml in $COMPOSE_DIR (set COMPOSE_DIR)." >&2
  exit 1
fi
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/nasiha}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

PG_USER="${PG_USER:-nasiha}"
PG_DB="${PG_DB:-nasiha}"

MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-nasiha}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-nasiha123}"
# Space-separated bucket list; empty (default) = every bucket on the server,
# so new ones (e.g. recordings) are picked up without editing this script.
MINIO_BUCKETS="${MINIO_BUCKETS:-}"

cd "$COMPOSE_DIR"
mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/minio"

echo "==> [1/3] Backing up Postgres ($PG_DB)..."
docker compose exec -T postgres pg_dump -U "$PG_USER" "$PG_DB" \
  | gzip > "$BACKUP_DIR/postgres/${PG_DB}-${TIMESTAMP}.sql.gz"

echo "==> [2/3] Backing up MinIO buckets..."
MINIO_CONTAINER="$(docker compose ps -q minio)"
if [ -z "$MINIO_CONTAINER" ]; then
  echo "MinIO container is not running (docker compose up first)." >&2
  exit 1
fi

# The minio/mc image is no longer pullable from Docker Hub, but the MinIO
# server image already ships the mc binary, so reuse whatever image the
# running minio container was started from.
MC_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$MINIO_CONTAINER")"

# mc [docker-run-args...] -- <mc args...>
mc() {
  local docker_args=()
  while [ "$1" != "--" ]; do docker_args+=("$1"); shift; done
  shift
  # Run as the invoking user so the backup files aren't root-owned (otherwise
  # the retention prune below can't delete them). HOME=/tmp gives mc a
  # writable config dir under an arbitrary uid.
  docker run --rm \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    --network "container:${MINIO_CONTAINER}" \
    -e "MC_HOST_local=http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@localhost:9000" \
    "${docker_args[@]}" \
    --entrypoint mc "$MC_IMAGE" "$@"
}

if [ -z "$MINIO_BUCKETS" ]; then
  MINIO_BUCKETS="$(mc -- ls --json local | sed -n 's/.*"key":"\([^"\/]*\)\/\{0,1\}".*/\1/p')"
  if [ -z "$MINIO_BUCKETS" ]; then
    echo "Couldn't list MinIO buckets." >&2
    exit 1
  fi
fi

for bucket in $MINIO_BUCKETS; do
  echo "  -> $bucket"
  mkdir -p "$BACKUP_DIR/minio/$bucket"
  # Runs a throwaway mc container sharing the minio container's network
  # namespace, so it reaches MinIO on localhost regardless of the compose
  # project/network name. Credentials passed via MC_HOST_ env var so nothing
  # is written to a persisted mc config.
  mc -v "$BACKUP_DIR/minio/$bucket:/backup" -- \
    mirror --overwrite --quiet "local/${bucket}" /backup >/dev/null
done

echo "==> [3/3] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime "+${RETENTION_DAYS}" -print -exec rm -rf {} \;

echo "==> Done."
du -sh "$BACKUP_DIR"
