# Deploying to production

```bash
./scripts/deploy-vps.sh
```

Builds the app/worker image from the current git `HEAD`, pushes it to Docker
Hub (`fz96tw/nasihaonline-app`/`-worker`, tagged both `latest` and the short
git SHA), then pulls and recreates `app`/`worker` on the VPS
(`nasihaforyou.org`). Refuses to run with uncommitted changes, so the
deployed image always traces back to a real commit. Ends with a health check
against the live site.

There's no equivalent script for `test.nasihaforyou.org` (homelab) — that
deployment rebuilds from its own local checkout, so `cd homelab && docker
compose up -d --build app worker` (after `git pull` if needed) already *is*
its whole deploy step. Verify a change there first, then run the script
above to promote it to the VPS.

This is a manual, deliberate promotion step, not a CI/CD pipeline — nothing
runs on push. Requires `docker login` (Docker Hub) and the VPS SSH alias
already configured.

# Backup / restore scripts

Backs up Postgres and MinIO from the docker-compose stack (`postgres`, `minio`
services), with `docker compose up` already running. The scripts find the
compose project themselves: `$COMPOSE_DIR` if set, else the script's parent
dir if it contains a `docker-compose.yml` (the VPS layout,
`/home/ubuntu/nasiha/scripts/`), else `<repo>/homelab` (this checkout). The
`docker compose` commands in the manual steps below must be run from that same
directory.

## Config (env vars, all optional — defaults match docker-compose.yml)

- `BACKUP_ROOT` — where backups are written (default `~/backups/nasiha`)
- `RETENTION_DAYS` — how long to keep old backups (default `14`)
- `PG_USER` (default `nasiha`), `PG_DB` (default `nasiha`)
- `MINIO_ACCESS_KEY` (default `nasiha`), `MINIO_SECRET_KEY` (default `nasiha123`)
- `MINIO_BUCKETS` — space-separated bucket list (default: every bucket on the
  server, so recordings and any new buckets are included automatically)
- `COMPOSE_DIR` — compose project directory (default: auto-detected, above)

`mc` runs from the same image as the running `minio` container (the
`minio/mc` image is no longer pullable from Docker Hub), as the invoking user
so backup files aren't root-owned.

## Taking a backup

```bash
./scripts/backup.sh
```

Writes to `$BACKUP_ROOT/<timestamp>/`:
- `postgres/<db>-<timestamp>.sql.gz` — gzipped `pg_dump`
- `minio/<bucket>/...` — mirrored copy of each bucket

Prunes backup folders older than `RETENTION_DAYS` automatically.

## Nightly backups on the VPS (production)

A systemd timer runs `backup.sh` every night at 08:00 UTC on the VPS, writing
to `/home/ubuntu/backups/nasiha/` with 14-day retention. The unit files live
in `vps/systemd/`; the script is copied to `/home/ubuntu/nasiha/scripts/`.
(The VPS image has no `cron`, and the timer's `Persistent=true` also runs a
missed backup after downtime.)

```bash
# check status / last run / logs
ssh 50.6.224.185 'systemctl list-timers nasiha-backup.timer; journalctl -u nasiha-backup -n 30'
# run one now
ssh 50.6.224.185 'sudo systemctl start nasiha-backup.service'

# (re)install after changing backup.sh or the unit files
scp scripts/backup.sh scripts/restore.sh 50.6.224.185:/home/ubuntu/nasiha/scripts/
scp vps/systemd/nasiha-backup.* 50.6.224.185:/tmp/
ssh 50.6.224.185 'sudo install -m 644 /tmp/nasiha-backup.* /etc/systemd/system/ && \
  sudo systemctl daemon-reload && sudo systemctl enable --now nasiha-backup.timer'
```

`deploy-vps.sh` does **not** sync these — re-run the `scp` above after editing
`backup.sh`.

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
   MC_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$MINIO_CONTAINER")"
   docker run --rm \
     --network "container:${MINIO_CONTAINER}" \
     -e "MC_HOST_local=http://nasiha:nasiha123@localhost:9000" \
     -v ~/backups/nasiha/<timestamp>/minio/attachments:/restore \
     --entrypoint mc "$MC_IMAGE" \
     mirror --overwrite --remove /restore local/attachments
   # repeat for each bucket dir in the backup (avatars, documents, recordings, ...)
   ```
5. **Verify the data**, then bring the app back up:
   ```bash
   docker compose start app worker
   ```

Double-check you're pointed at the actual production host/db before running
step 3 — there is nothing in these commands that will stop you from doing
this against the wrong environment.

## Showup (separate service, separate stack)

```bash
./scripts/deploy-showup.sh            # DRY_RUN=1 to preview the push/ssh steps
```

Deploys `showup/` to https://showup.cloudcurio.com from its own compose project
(`vps/showup/`, at `/home/ubuntu/showup` on the VPS). Builds and pushes
`fz96tw/showup-app`, then pulls and recreates only the `showup` service; it never
touches the Nasiha stack. One-time VPS setup (DNS, proxy host, MinIO bucket via
`setup-minio-showup-recordings.sh`, LiveKit webhook) is in `vps/showup/README.md`.
