# CLAUDE.md (showup/)

Showup is a free, no-account, code-based screen-share meeting service built on LiveKit, with the presenter webcam overlay. It lives in this folder of the Nasiha repo for now but is meant to be split into its own repo later.

## Rules for this folder

- **Self-contained.** Never import from `../web/` (or anything outside `showup/`). If you need something from Nasiha, copy it in. This is what keeps the later repo split a plain move.
- **Not Nasiha.** No Clerk, no Prisma/Postgres, no medical/community framing, no Nasiha branding or legal copy. Anonymous users only; there are no accounts.
- **Working name: Showup.** Name, domain and trademark clearance is a separate Planwright objective ("Showup 03"). Don't hardcode a final domain yet.
- **Ports.** Run dev on 3012 (`npm run dev -- -p 3012`). Never bind 3010 (live Nasiha app) or 3011 (where `web/` dev runs).
- **Commits** start with `showup:` and don't mix `showup/` changes with `web/` changes.
- **Planwright:** work is tracked as the "Showup — Standalone Screen-Share Service" initiative in the Nasihaonline project (objectives are numbered "Showup 01".."Showup 10" in build order). The approved plan is `/home/nadeem/.claude/plans/i-want-to-make-composed-dragonfly.md`.

## Layout

- `app/` Next.js App Router: landing page (`page.tsx`), room page (`room/`), API routes (`api/rooms/start`, `api/rooms/join`, `api/health`).
- `lib/livekit.ts` server-only LiveKit helpers (token mint, room service, webhook verify). `lib/room-code.ts` code normalization and room naming.
- `lib/presenter-overlay/compositor.ts` and `components/presenter-overlay-control.tsx` the client-side webcam overlay, copied from Nasiha's `web/`. The overlay is composited in the sharer's browser; no server involvement.
- `components/showup-room.tsx` the in-meeting screen (LiveKit `VideoConference` plus overlay controls).
- `lib/rate-limit.ts` / `lib/redis.ts` copied from Nasiha; not wired up until the room-state objective.

## Environment

See `.env.example`. LiveKit is the shared self-hosted instance; Showup room names are prefixed `showup-`.
