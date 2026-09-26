# Showup on the VPS

Showup (https://showup.cloudcurio.com) runs as its own compose project, separate from the Nasiha stack in `../docker-compose.yml`. Nothing in the Nasiha compose depends on Showup, and Showup's core (its own Redis + the app) doesn't depend on Nasiha's containers starting. It only *uses* the shared LiveKit/egress (essential) and MinIO (recording only) over the external `appnet` network, and tolerates them being down.

- Compose file: `docker-compose.yml` (copied by hand to `/home/ubuntu/showup/` on the VPS, like the Nasiha one).
- Env: `/home/ubuntu/showup/.env` on the VPS only. Template: `.env.example`.
- Deploy: `scripts/deploy-showup.sh` from the repo root (build, push `fz96tw/showup-app`, pull + recreate only `showup`, health check).
- **Never** run a bare `docker compose up -d` against the Nasiha stack, and never touch the Nasiha app on port 3010.

## One-time setup (in this order)

Steps marked **(affects Nasiha)** touch shared production pieces, so do them when no live meetings or showup sessions are running.

1. **DNS** (Namecheap → Advanced DNS for `cloudcurio.com`): add an `A` record, host `showup`, value `50.6.224.185`. Check with `dig +short showup.cloudcurio.com`.
2. **Showup directory + env on the VPS**
   ```bash
   ssh 50.6.224.185 'mkdir -p /home/ubuntu/showup'
   scp vps/showup/docker-compose.yml 50.6.224.185:/home/ubuntu/showup/
   scp vps/showup/.env.example 50.6.224.185:/home/ubuntu/showup/.env   # then edit: LiveKit key/secret, MinIO secret (openssl rand -hex 24)
   ```
3. **MinIO bucket + scoped user + 1-day expiry** (adds a bucket to the shared MinIO; touches nothing existing):
   ```bash
   scp scripts/setup-minio-showup-recordings.sh 50.6.224.185:/home/ubuntu/showup/
   ssh 50.6.224.185 '/home/ubuntu/showup/setup-minio-showup-recordings.sh'
   ```
   **Recording retention is 24 hours.** The app enforces it itself: the recording's Redis keys expire 24 hours after it is created (`RECORDING_TTL_SECONDS`), after which the recording page, download links and recovery by code all stop working. The bucket rule removes the files. MinIO lifecycle rules work in whole days and run on a daily sweep, so the bytes can linger for up to about a day after the recording becomes unreachable.
   The script only adds the rule when none exists, so a bucket created earlier keeps its old 7-day rule. To change a live bucket, on the VPS: `mc ilm rule ls local/showup-recordings`, then `mc ilm rule edit --id <rule-id> --expire-days 1 local/showup-recordings` (run through the MinIO container, as the script does).
4. **Start Showup's Redis**: `ssh 50.6.224.185 'cd /home/ubuntu/showup && docker compose up -d showup-redis'`
5. **nginx-proxy-manager alias (affects Nasiha)**: the hairpin-NAT fix, so LiveKit's webhook to `showup.cloudcurio.com` reaches the proxy from inside the host. `../docker-compose.yml` already lists the alias; copy it up and recreate only the proxy (a few seconds of blip for every site on it):
   ```bash
   scp vps/docker-compose.yml 50.6.224.185:/home/ubuntu/nasiha/docker-compose.yml
   ssh 50.6.224.185 'cd /home/ubuntu/nasiha && docker compose up -d --no-deps nginxproxymanager'
   ```
6. **Proxy host**: run `scripts/setup-nginx-showup-proxy.sh` on the VPS (`scp` it up, then `ssh -t 50.6.224.185 /home/ubuntu/showup/setup-nginx-showup-proxy.sh`; it prompts for the NPM admin login and is idempotent). Or by hand in the NPM admin UI (SSH tunnel to 127.0.0.1:81): domain `showup.cloudcurio.com` → scheme `http`, forward host `showup`, port `3000`, enable **Websockets Support**, SSL tab: request a Let's Encrypt cert, **Force SSL**. (Needs step 1's DNS to resolve first.)
7. **First deploy**: `scripts/deploy-showup.sh`. It builds, pushes, recreates `showup` only, and passes when `https://showup.cloudcurio.com/api/health` returns 200.
8. **LiveKit webhook (affects Nasiha; restarts LiveKit, which drops live meetings and showup sessions)**: add `https://showup.cloudcurio.com/api/webhooks/livekit` under `webhook.urls` (see `../livekit.yaml.example`). The real file is sops-encrypted:
   ```bash
   sops --config /dev/null --input-type yaml --output-type yaml -d vps/livekit.yaml.enc > /tmp/livekit.yaml   # needs the age key
   # edit /tmp/livekit.yaml: add the second URL
   scp /tmp/livekit.yaml 50.6.224.185:/home/ubuntu/nasiha/livekit.yaml
   ssh 50.6.224.185 'cd /home/ubuntu/nasiha && docker compose restart livekit'
   # re-encrypt into vps/livekit.yaml.enc (see scripts/secrets-backup-vps.sh) and commit; shred /tmp/livekit.yaml
   ```
   Both apps receive every event and ignore rooms that aren't theirs (`showup-` prefix vs Nasiha's).

## Verify

```bash
# Redis naming rules: `redis` is Nasiha's, `showup-redis` is Showup's, and Showup's Redis is NOT on appnet
ssh 50.6.224.185 'docker exec showup-showup-1 getent hosts redis showup-redis'
ssh 50.6.224.185 "docker inspect -f '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}' showup-showup-redis-1"   # -> showup_default only
ssh 50.6.224.185 'docker exec showup-showup-1 printenv REDIS_URL'                                                            # -> redis://showup-redis:6379
# Restart policies
ssh 50.6.224.185 "docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' showup-showup-1 showup-showup-redis-1"
# Webhook: start and end a showup session, then the code should be free immediately (room_finished), not after the TTL
ssh 50.6.224.185 "docker exec showup-showup-redis-1 redis-cli --scan --pattern 'showup:room:*'"
ssh 50.6.224.185 'docker logs livekit --since 10m 2>&1 | grep -i webhook | tail'
```

Also confirm Nasiha is unaffected: the live site answers, and a Nasiha LiveKit meeting still connects.
