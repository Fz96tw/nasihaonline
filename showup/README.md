# Showup

Free, no-account screen sharing by code. One person starts a share with a code they choose; anyone with the code joins the same room. Built on LiveKit with a client-side presenter webcam overlay. Working name; see `CLAUDE.md` for the rules for working in this folder.

## Run it locally

Prerequisites: Node 20+, Docker (for Redis only).

```bash
# 1. Throwaway Redis (host port 6380 so it never collides with Nasiha's Redis on 6379)
docker run -d --name showup-redis -p 6380:6379 redis:7-alpine

# 2. Install and configure
cd showup
npm install
cp .env.example .env.local
#   then fill in LIVEKIT_API_KEY and LIVEKIT_API_SECRET (see below)

# 3. Start the dev server on 3012
npm run dev -- -p 3012
```

Open <http://localhost:3012>. Always use port 3012: **3010 is the live Nasiha app and 3011 is where `web/` dev runs.**

Or run Redis and the app together with Compose: `docker compose -f docker-compose.dev.yml up` (app on <http://localhost:3012>, Redis on 6380). It reads the same `.env.local`.

### LiveKit credentials

Local dev uses the shared self-hosted LiveKit at `wss://livekit.nasihaforyou.org`, so there is nothing to run for media. `LIVEKIT_URL` is already set in `.env.example`; the key and secret are not committed. Copy `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from `web/.env` (or the VPS `.env`) into `showup/.env.local`. Showup rooms are prefixed `showup-`, so they don't collide with Nasiha's rooms on the same server.

### Redis

Redis holds the room-code claims (`showup:room:*`) and the rate-limit counters. Start/join need it: without it they answer `503` with `Retry-After` (the app itself still boots and recovers on its own when Redis returns).

### Behavior worth knowing while testing

- A code is claimed by the first starter. A second start on the same code gets "already in use" (and a "Use a random code instead" button); it is never offered a way in.
- Refreshing the host tab reclaims host (the tab keeps a `hostSecret` in sessionStorage). Guests who refresh go back to the landing page and rejoin.
- Wrong-code joins are limited to 10 per 10 minutes per IP (then `429`). On localhost every request shares one IP, so clear the counters when you hit it: `docker exec showup-redis redis-cli --scan --pattern 'ratelimit:*' | xargs docker exec -i showup-redis redis-cli del`.
- A host who disappears frees the code within about 2-3 minutes even without webhooks: the empty LiveKit room closes after 2 minutes, and a start on an abandoned code is allowed once the claim is over a minute old and the room is empty. Otherwise the claim expires after 3 hours.
- `GET /api/health` always returns 200 and reports `redis`, `livekit` and `minio` as `up`, `down` or `not_configured`, with an overall `status` of `ok` or `degraded`.

## Test with two participants

Camera, mic and screen sharing need a secure context. `http://localhost` counts as one; a LAN IP like `http://192.168.x.x:3012` does not.

1. Window A (normal): on the landing page, **Start a share**, click Generate for a code, enter a name.
2. Window B (incognito, so it has its own session storage): **Join with a code**, enter the same code and a different name.

Both windows land in the same room. Room codes are case- and whitespace-insensitive.

Your machine may not have a second camera or microphone. For the guest window, launch Chrome with fake devices so the permission prompts and hardware are skipped:

```bash
google-chrome --user-data-dir=/tmp/showup-guest --incognito \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  http://localhost:3012
```

## What can't be tested locally

| Feature | Why | Fallback |
| --- | --- | --- |
| Instant code cleanup on `room_finished` (`/api/webhooks/livekit`) | LiveKit sends webhooks to its configured public URLs (the VPS), which can't reach `localhost` | The abandoned-claim takeover and the claim TTL free the code instead (see above). To test the real path, deploy to the VPS, or post a signed webhook to localhost yourself |
| Recording readiness on `egress_ended` | Same webhook limitation, so the "recording is ready" event never arrives | Test recording on the VPS after deploy, or expose the dev server with a tunnel (e.g. `ngrok http 3012`) and point a LiveKit webhook at it |
| Anything needing the public domain or HTTPS from a LAN device | `localhost` is the only secure context | Use a tunnel, or test on the VPS |

Start/join, the room screen, the webcam overlay and host controls all work locally.

## Scripts

- `npm run dev` / `npm run build` / `npm start` / `npm run lint`
- `GET /api/health` returns `{"status":"ok"}`.
