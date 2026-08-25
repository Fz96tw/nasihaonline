# LiveKit Hosting Decision (Planwright objective 5)

## Decision

Self-host LiveKit (server + egress) on the production VPS, rather than LiveKit Cloud (free "Build" tier or paid "Ship" tier, ~$50/mo).

## Reasoning

NASIHA's actual meeting volume is tiny — at the time of this decision, `meeting_requests` had 14 rows total, ever, peaking at 5/day, and every one is a 1:1 mentor/member call. That's far under LiveKit Cloud Build tier's concurrency caps (100 participants, 2 concurrent egress). The cap that actually binds is one not listed in the original objective: **Room Composite Egress and Track Egress share a single 60-minute/month pool** on Build tier (confirmed via LiveKit's pricing page, not just the quotas doc) — trivially exceeded once recording (the core reason "Nasiha Conference" exists over Google Meet, see `project_google_meet_recording_workspace_only`) is used for even one or two real calls a month. Upgrading to Ship tier removes that cap but costs $50/mo, which was ruled out.

Self-hosting removes LiveKit's account-level quotas entirely. The production VPS (4 vCPU / 8GB RAM / 200GB NVMe / unmetered bandwidth) has ample spare capacity and already runs the equivalent self-hosted stack (Postgres/Redis/MinIO/Meilisearch) behind nginx-proxy-manager, so this is a natural extension rather than new infrastructure. The app's SDK usage is unchanged either way — moving back to LiveKit Cloud later, if volume ever genuinely exceeds VPS capacity, is just a `LIVEKIT_URL`/API-key swap.

## What was set up

- `livekit-server` (embedded TURN) + `egress` (recording) services, added to `vps/docker-compose.yml` — see `vps/livekit.yaml.example` / `vps/egress.yaml.example` for config (real `livekit.yaml`/`egress.yaml` are gitignored, generated per-deploy). These services only run in `vps/` — `homelab/`'s app container points its `LIVEKIT_URL` at this shared VPS instance instead.
- Egress coordinates with `livekit-server` via the existing `redis` service (no new Redis instance).
- Recordings write to a dedicated MinIO bucket (`livekit-recordings`) via a scoped `livekit-egress` user, provisioned by `scripts/setup-minio-recordings.sh`.
- Public endpoints (reverse-proxied through the VPS's existing nginx-proxy-manager, TLS via its normal Let's Encrypt flow):
  - `livekit.nasihaforyou.org` → `livekit:7880` (Websockets Support required)
  - `vps-s3.nasihaforyou.org` → `minio:9000` (needs `client_max_body_size 0;` for large recording uploads)
- Firewall: `7881/tcp` (ICE/TCP fallback), `50000-50200/udp` (RTC media), `3478/udp` (TURN), `51000-51100/udp` (TURN relay range — narrowed from LiveKit's 10,000-port default).

## Hairpin NAT fix (important if this is ever redeployed)

Containers on the VPS (both `app` and `egress`) cannot reach the VPS's own public IP — connections to `livekit.nasihaforyou.org` / `vps-s3.nasihaforyou.org` from *inside* the VPS's Docker network time out, because the network doesn't support NAT hairpinning back to the host's own public IP. This isn't optional to fix: without it, the app server's own calls to create rooms/tokens/egress fail, and egress's S3 uploads fail (confirmed by reproducing the exact failure — `dial tcp <vps-ip>:443: i/o timeout` — before fixing it).

Fix: give the `nginxproxymanager` service Docker network aliases for both subdomains, so containers resolve them directly to nginx internally instead of round-tripping through the public IP:

```yaml
nginxproxymanager:
  networks:
    appnet:
      aliases:
        - livekit.nasihaforyou.org
        - vps-s3.nasihaforyou.org
```

(This lives in `vps/docker-compose.yml` — `nginxproxymanager` is only defined there, not in `homelab/docker-compose.yml`, since the two are separate self-contained deployments, not a shared/merged file. See `CLAUDE.md` for the `homelab/` vs `vps/` split.)

## Verified end-to-end (2026-08-25)

Created a real room over the public `wss://` endpoint, joined a publishing participant (media flowed through the TURN relay range, confirmed in `livekit-server` logs), started room-composite egress, and confirmed a real MP4 landed in the `livekit-recordings` MinIO bucket via the public HTTPS endpoint. Test artifacts cleaned up afterward.

## Live site repointed (2026-08-25)

The above was verified against the VPS's own app instance, but the actual live site (`nasihaforyou.org`, still served from the AT&T homelab box at this point in the migration — see `CLAUDE.md`) was still pointing `LIVEKIT_URL` at a LiveKit Cloud project, unaffected by this decision. Repointed `homelab/.env`'s `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` and `MINIO_PUBLIC_ENDPOINT`/`MINIO_RECORDINGS_ACCESS_KEY`/`MINIO_RECORDINGS_SECRET_KEY` at the same self-hosted VPS instance (rather than standing up a second LiveKit deployment), restarted the `app` container, and confirmed room creation succeeds using the homelab app's actual configured credentials. The self-hosting decision is now in effect for real production traffic, not just the VPS's own copy.

**Gotcha found and fixed the same day:** recording playback resolves `objectKey` → presigned URL fresh at click time using *current* `MINIO_PUBLIC_ENDPOINT` (see `lib/recordings-storage.ts`) — nothing is baked in when a recording is made. So the repoint above broke the 2 pre-existing recordings (both from one event, made before the repoint): their files were still sitting in this host's own local MinIO, but links now got signed against the VPS's MinIO, which didn't have them. Fixed by copying both objects (`mc cp`) from the local MinIO to the VPS's `livekit-recordings` bucket under the identical `objectKey`, then verified a presigned URL against the new location actually streams the video. If this repoint is ever redone elsewhere, any existing recordings need the same copy step first.
