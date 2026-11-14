#!/usr/bin/env bash
# Restore-drill for a backup produced by backup.sh. Restores Postgres into a
# separate throwaway database and MinIO into separate throwaway buckets, so
# running this never touches your real data. Use it to prove backups are
# actually restorable, not just present on disk.
#
# Usage: scripts/restore.sh /path/to/backups/nasiha/<timestamp>
set -euo pipefail

BACKUP_DIR="${1:?Usage: $0 <backup-dir> (e.g. ~/backups/nasiha/20260808-020000)}"
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

PG_USER="${PG_USER:-nasiha}"
PG_RESTORE_DB="${PG_RESTORE_DB:-nasiha_restore_test}"

MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-nasiha}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-nasiha123}"
MINIO_BUCKET_SUFFIX="${MINIO_BUCKET_SUFFIX:--restore-test}"

cd "$COMPOSE_DIR"

echo "==> [1/2] Restoring Postgres into throwaway db '$PG_RESTORE_DB'..."
DUMP_FILE="$(find "$BACKUP_DIR/postgres" -name '*.sql.gz' | head -n1)"
if [ -z "$DUMP_FILE" ]; then
  echo "No .sql.gz dump found under $BACKUP_DIR/postgres" >&2
  exit 1
fi

docker compose exec -T postgres dropdb -U "$PG_USER" --if-exists "$PG_RESTORE_DB"
docker compose exec -T postgres createdb -U "$PG_USER" "$PG_RESTORE_DB"
gunzip -c "$DUMP_FILE" | docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_RESTORE_DB" >/dev/null
echo "  -> restored $(gunzip -c "$DUMP_FILE" | wc -l) lines of SQL from $(basename "$DUMP_FILE")"
docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_RESTORE_DB" -c \
  "SELECT schemaname, count(*) AS tables FROM pg_tables WHERE schemaname='public' GROUP BY schemaname;"

echo "==> [2/2] Restoring MinIO buckets into '<bucket>${MINIO_BUCKET_SUFFIX}'..."
MINIO_CONTAINER="$(docker compose ps -q minio)"
if [ -z "$MINIO_CONTAINER" ]; then
  echo "MinIO container is not running (docker compose up first)." >&2
  exit 1
fi

# minio/mc is no longer pullable; the MinIO server image ships mc.
MC_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$MINIO_CONTAINER")"

for bucket_dir in "$BACKUP_DIR"/minio/*/; do
  bucket="$(basename "$bucket_dir")"
  restore_bucket="${bucket}${MINIO_BUCKET_SUFFIX}"
  echo "  -> $bucket -> $restore_bucket"
  docker run --rm \
    --network "container:${MINIO_CONTAINER}" \
    -e "MC_HOST_local=http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@localhost:9000" \
    -v "$bucket_dir:/restore" \
    --entrypoint sh "$MC_IMAGE" \
    -c "mc mb --ignore-existing local/${restore_bucket} && mc mirror --overwrite --quiet /restore local/${restore_bucket}"
done

cat <<EOF

==> Restore drill complete.
    Postgres: verify data in database '$PG_RESTORE_DB' (docker compose exec postgres psql -U $PG_USER -d $PG_RESTORE_DB)
    MinIO:    verify objects in buckets named '<name>${MINIO_BUCKET_SUFFIX}'

    Clean up when done:
      docker compose exec postgres dropdb -U $PG_USER $PG_RESTORE_DB
      (remove the '*${MINIO_BUCKET_SUFFIX}' buckets via mc rb --force)
EOF
