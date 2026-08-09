#!/usr/bin/env bash
# Backs up the Postgres database and MinIO buckets from the docker-compose
# stack into timestamped local files, then prunes anything older than
# RETENTION_DAYS. Run from anywhere; it locates docker-compose.yml relative
# to this script.
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/nasiha}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

PG_USER="${PG_USER:-nasiha}"
PG_DB="${PG_DB:-nasiha}"

MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-nasiha}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-nasiha123}"
MINIO_BUCKETS="${MINIO_BUCKETS:-attachments avatars documents}"

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

for bucket in $MINIO_BUCKETS; do
  echo "  -> $bucket"
  mkdir -p "$BACKUP_DIR/minio/$bucket"
  # Runs a throwaway mc container sharing the minio container's network
  # namespace, so it reaches MinIO on localhost regardless of the compose
  # project/network name. Credentials passed via MC_HOST_ env var so nothing
  # is written to a persisted mc config.
  docker run --rm \
    --network "container:${MINIO_CONTAINER}" \
    -e "MC_HOST_local=http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@localhost:9000" \
    -v "$BACKUP_DIR/minio/$bucket:/backup" \
    minio/mc:latest \
    mirror --overwrite --quiet "local/${bucket}" /backup
done

echo "==> [3/3] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime "+${RETENTION_DAYS}" -print -exec rm -rf {} \;

echo "==> Done."
du -sh "$BACKUP_DIR"
