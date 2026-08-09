# Backup / restore scripts

Backs up Postgres and MinIO from the docker-compose stack (`postgres`, `minio`
services). Run all commands from the repo root, with `docker compose up`
already running.

## Config (env vars, all optional — defaults match docker-compose.yml)

- `BACKUP_ROOT` — where backups are written (default `~/backups/nasiha`)
- `RETENTION_DAYS` — how long to keep old backups (default `14`)
- `PG_USER` (default `nasiha`), `PG_DB` (default `nasiha`)
- `MINIO_ACCESS_KEY` (default `nasiha`), `MINIO_SECRET_KEY` (default `nasiha123`)
- `MINIO_BUCKETS` — space-separated bucket list (default `attachments avatars documents`)

## Taking a backup

```bash
./scripts/backup.sh
```

Writes to `$BACKUP_ROOT/<timestamp>/`:
- `postgres/<db>-<timestamp>.sql.gz` — gzipped `pg_dump`
- `minio/<bucket>/...` — mirrored copy of each bucket

Prunes backup folders older than `RETENTION_DAYS` automatically.

**This only writes to local disk on the host.** For real disaster recovery
(surviving total host failure) the resulting `$BACKUP_ROOT` directory still
needs to be shipped somewhere off this machine — no offsite step is wired up
yet.

## Testing a restore (safe — does not touch real data)

```bash
./scripts/restore.sh ~/backups/nasiha/<timestamp>
```

- Restores Postgres into a throwaway database: `nasiha_restore_test`
  (override with `PG_RESTORE_DB`)
- Restores MinIO into throwaway buckets: `<bucket>-restore-test`
  (override the suffix with `MINIO_BUCKET_SUFFIX`)

Inspect the throwaway db/buckets to confirm the backup is actually valid,
then clean up:

```bash
docker compose exec postgres dropdb -U nasiha nasiha_restore_test
# and remove the *-restore-test buckets via mc rb --force
```

Run this periodically — an untested backup is a hope, not a plan.

## Restoring to the REAL production database (destructive)

There is no automated script for this on purpose — it overwrites live data
and should not be a one-command operation. Do this manually, carefully:

1. **Take a fresh backup of the current state first**, in case this restore
   turns out to be a mistake:
   ```bash
   ./scripts/backup.sh
   ```
2. **Stop the app and worker** so nothing writes during the restore:
   ```bash
   docker compose stop app worker
   ```
3. **Restore Postgres** — the plain dump only has `CREATE TABLE`, not `DROP
   TABLE`, so the target db must be empty first:
   ```bash
   docker compose exec postgres dropdb -U nasiha nasiha
   docker compose exec postgres createdb -U nasiha nasiha
   gunzip -c ~/backups/nasiha/<timestamp>/postgres/*.sql.gz \
     | docker compose exec -T postgres psql -U nasiha -d nasiha
   ```
4. **Restore MinIO** — mirror straight into the real bucket names. Add
   `--remove` if you want the bucket to exactly match the backup (deletes
   anything added since the backup was taken):
   ```bash
   MINIO_CONTAINER="$(docker compose ps -q minio)"
   docker run --rm \
     --network "container:${MINIO_CONTAINER}" \
     -e "MC_HOST_local=http://nasiha:nasiha123@localhost:9000" \
     -v ~/backups/nasiha/<timestamp>/minio/attachments:/restore \
     minio/mc:latest \
     mirror --overwrite --remove /restore local/attachments
   # repeat for avatars, documents
   ```
5. **Verify the data**, then bring the app back up:
   ```bash
   docker compose start app worker
   ```

Double-check you're pointed at the actual production host/db before running
step 3 — there is nothing in these commands that will stop you from doing
this against the wrong environment.
