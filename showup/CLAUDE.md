# CLAUDE.md (showup/)

Showup is a free, no-account, code-based screen-share meeting service built on LiveKit, with the presenter webcam overlay. It lives in this folder of the Nasiha repo for now but is meant to be split into its own repo later.

## Rules for this folder

- **Self-contained.** Never import from `../web/` (or anything outside `showup/`). If you need something from Nasiha, copy it in. This is what keeps the later repo split a plain move.
- **Not Nasiha.** No Clerk, no Prisma/Postgres, no medical/community framing, no Nasiha branding or legal copy. Anonymous users only; there are no accounts.
- **Name: Showup. Domain: `showup.cloudcurio.com`** (decided in Showup 03; see `NAMING.md` for clearance findings and the DNS setup). DNS for `cloudcurio.com` is at Namecheap; the A record for `showup` -> VPS `50.6.224.185` is added during the deploy objective (Showup 05). Read the domain from env (`NEXT_PUBLIC_APP_URL`) rather than hardcoding it.
- **Ports.** Run dev on 3012 (`npm run dev -- -p 3012`). Never bind 3010 (live Nasiha app) or 3011 (where `web/` dev runs).
- **Commits** start with `showup:` and don't mix `showup/` changes with `web/` changes.
- **Planwright:** work is tracked as the "Showup — Standalone Screen-Share Service" initiative in the Nasihaonline project (objectives are numbered "Showup 01".."Showup 10" in build order). The approved plan is `/home/nadeem/.claude/plans/i-want-to-make-composed-dragonfly.md`.

## Layout

- `app/` Next.js App Router: landing page (`page.tsx`), room page (`room/`), API routes (`api/rooms/start`, `api/rooms/join`, `api/health`).
- `lib/livekit.ts` server-only LiveKit helpers (token mint, room service, webhook verify). `lib/room-code.ts` code normalization and room naming.
- `lib/presenter-overlay/compositor.ts` and `components/presenter-overlay-control.tsx` the client-side webcam overlay, copied from Nasiha's `web/`. The overlay is composited in the sharer's browser; no server involvement.
- `components/showup-room.tsx` the in-meeting screen (LiveKit `VideoConference` plus overlay controls).
- `lib/redis.ts` / `lib/rate-limit.ts` (copied from Nasiha, then adapted): Redis client that tolerates Redis being down, and the rate limiter. `lib/room-state.ts` holds the `showup:room:{digest}` code claims (SET NX, hostSecret reclaim). Routes catch dependency failures and answer 503 + Retry-After (`unavailableResponse`), never a 500. `api/webhooks/livekit` frees a code on `room_finished`. `api/health` always returns 200 with per-dependency status.

## Environment

See `.env.example`. LiveKit is the shared self-hosted instance; Showup room names are prefixed `showup-`.

## Running locally

See `README.md`. Short version: start Redis (`docker run -d --name showup-redis -p 6380:6379 redis:7-alpine`), `cp .env.example .env.local` and add the LiveKit key/secret, then `npm run dev -- -p 3012`. LiveKit webhooks can't reach localhost, so `room_finished` cleanup and `egress_ended` recording readiness can only be tested on the VPS or through a tunnel.
