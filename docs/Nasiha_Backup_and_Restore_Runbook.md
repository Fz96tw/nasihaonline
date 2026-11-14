# Nasiha Backup & Restore Runbook

How to recover production (`nasihaforyou.org`, the Bluehost VPS) from its
nightly backups. For how the backup scripts themselves work, see
[`scripts/README.md`](../scripts/README.md).

## What is backed up

| What | How | Where |
|---|---|---|
| Postgres (`nasiha` db) | Full `pg_dump`, gzipped, nightly | VPS `~/backups/nasiha/<ts>/postgres/` |
| MinIO (every bucket: attachments, avatars, documents, recordings…) | Full copy, nightly | VPS `~/backups/nasiha/<ts>/minio/<bucket>/` |
| Secrets (`.env`, `livekit.yaml`, `egress.yaml`) | sops+age encrypted, manual | Git: `vps/*.enc`, `homelab/.env.enc` |
| App code / images | Git + Docker Hub (`:<git-sha>` tags) | GitHub, Docker Hub |

- **Schedule:** systemd timer `nasiha-backup.timer` runs every night at 08:00 UTC
  (`vps/systemd/`). Logs: `journalctl -u nasiha-backup`.
- **Retention:** 7 days. `backup.sh` deletes older folders at the end of each successful run.
- **Not backed up:** Meilisearch (rebuilt by reindexing, see §3 step 6), Redis
  (only rate-limit data), Grafana/Prometheus data, and nginx-proxy-manager's
  proxy hosts and TLS certificates (rebuilt by hand).

## Recovery targets

- **Max data loss:** about 24h (nightly backups).
- **Time to restore on the same host:** a few minutes at the current data size (about 2.6 GB).
- **Total VPS loss:** **not recoverable yet.** Backups live only on the VPS's own
  disk. Copying them offsite is still an open item.

---

All commands below run **on the VPS** (`ssh 50.6.224.185`) from **`~/nasiha`**
unless noted otherwise.

## 0. Before anything: pick the backup and stop more damage

1. List backups: `ls ~/backups/nasiha/`. Choose the newest one **from before the
   problem started**, which may not be the newest one overall.
2. **Pin it** so the nightly cleanup can't delete it while you work. Cleanup only
   looks inside `nasiha/`, so `keep-*` copies are never deleted:
   ```bash
   cp -a ~/backups/nasiha/<ts> ~/backups/keep-<ts>
   ```
3. If something is still corrupting data, stop writers:
   ```bash
   docker compose stop app worker
   ```

## 1. Restore drill (monthly, and after any backup change)

Proves backups are actually restorable without touching real data.

```bash
~/nasiha/scripts/restore.sh ~/backups/nasiha/<ts>
```

This loads the backup into database `nasiha_restore_test` and buckets `<bucket>-restore-test`.
Spot-check recent members, events and files, then clean up:

```bash
docker compose exec postgres dropdb -U nasiha nasiha_restore_test
# remove the *-restore-test buckets with: mc rb --force local/<bucket>-restore-test
```

## 2. Partial loss: a deleted record or file

Don't do a full restore for this.

**Database rows:**
1. Run `restore.sh` (§1) to load the backup into `nasiha_restore_test`.
2. Find the rows there and export them:
   ```bash
   docker compose exec -T postgres psql -U nasiha -d nasiha_restore_test \
     -c "\copy (SELECT * FROM \"<Table>\" WHERE id IN ('...')) TO STDOUT" > rows.tsv
   ```
3. Import them into the real database:
   ```bash
   docker compose exec -T postgres psql -U nasiha -d nasiha \
     -c "\copy \"<Table>\" FROM STDIN" < rows.tsv
   ```
   Restore parent rows before child rows if foreign keys depend on them.
4. Drop `nasiha_restore_test`.

**A single file:** copy it from
`~/backups/nasiha/<ts>/minio/<bucket>/<path>` back into the bucket:

```bash
MINIO_CONTAINER="$(docker compose ps -q minio)"
MC_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$MINIO_CONTAINER")"
docker run --rm --network "container:${MINIO_CONTAINER}" \
  -e "MC_HOST_local=http://nasiha:nasiha123@localhost:9000" \
  -v ~/backups/nasiha/<ts>/minio/<bucket>:/restore:ro \
  --entrypoint mc "$MC_IMAGE" cp /restore/<path> local/<bucket>/<path>
```

## 3. Full restore on the same VPS (database corrupted, bad migration…)

1. **Back up the current state first**, in case the restore itself is a mistake:
   ```bash
   sudo systemctl start nasiha-backup
   ```
2. **Stop writers:**
   ```bash
   docker compose stop app worker
   ```
3. **Postgres.** The dump has no `DROP` statements, so the database must be empty first:
   ```bash
   docker compose exec postgres dropdb -U nasiha nasiha
   docker compose exec postgres createdb -U nasiha nasiha
   gunzip -c ~/backups/nasiha/<ts>/postgres/*.sql.gz \
     | docker compose exec -T postgres psql -U nasiha -d nasiha
   ```
4. **MinIO (only if files were lost).** For each bucket folder in the backup:
   ```bash
   MINIO_CONTAINER="$(docker compose ps -q minio)"
   MC_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$MINIO_CONTAINER")"
   docker run --rm --network "container:${MINIO_CONTAINER}" \
     -e "MC_HOST_local=http://nasiha:nasiha123@localhost:9000" \
     -v ~/backups/nasiha/<ts>/minio/<bucket>:/restore \
     --entrypoint mc "$MC_IMAGE" \
     mirror --overwrite /restore local/<bucket>
   ```
   Add `--remove` only if you want to delete files added since the backup.
5. **Start the app.** On start it runs `prisma migrate deploy` and the seed, so an
   older dump is migrated forward to the current schema:
   ```bash
   docker compose start app worker
   ```
6. **Rebuild search** (Meilisearch isn't backed up, so it's now out of date):
   ```bash
   for i in profiles library forum-threads events announcements surveys review-items; do
     docker compose exec app npm run reindex:$i
   done
   ```
7. **Verify.** `https://nasihaforyou.org/api/health` should return 200. Log in and check
   recent members, events and uploads.

> ⚠️ Before step 3, confirm you are **on the VPS in `~/nasiha`**. Nothing in
> these commands stops you from running them against the wrong host or database.

## 4. Total VPS loss / rebuild on a new host

1. **Secrets:** get the age private key from the password manager and save it to
   `~/.config/sops/age/keys.txt`. Then clone the repo and run:
   ```bash
   scripts/secrets-restore.sh   # recreates vps/.env, vps/livekit.yaml, vps/egress.yaml
   ```
2. **Stack:** copy `vps/` (compose file, decrypted secrets, `prometheus.yml`,
   `grafana/`) to the new host, then `docker compose up -d`.
3. **Backup timer:** reinstall it (see `scripts/README.md`, "Nightly backups on the VPS").
   After that, every deploy keeps `scripts/backup.sh` up to date.
4. **Proxy:** rebuild the nginx-proxy-manager proxy hosts and TLS certificates by
   hand, and redo the hairpin-NAT fix for each subdomain. Point DNS at the new host.
5. **Data:** restore Postgres + MinIO as in §3, **from an offsite copy.** None
   exists yet, so today this step can't be done.

## Open gaps (as of 2026-11-13)

- [ ] No offsite copy of backups, so losing the VPS loses all member data.
- [x] Restore drill (§1) run against a VPS backup: **passed 2026-11-14** on backup
      `20261114-031908`. All 81 tables matched live row-for-row (3,163 rows), all 5
      buckets matched by file count, names and size (~2.5 GiB), and a sample
      recording's sha256 matched. It took 19s. Run it again monthly.
- [ ] Encrypted secrets in git (`vps/*.enc`) predate the 2026-09-05 cutover.
      Re-run `scripts/secrets-backup-vps.sh` and commit.
- [ ] nginx-proxy-manager config and certificates (`npm_data`, `npm_letsencrypt` volumes)
      not backed up.
