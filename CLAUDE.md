# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repo has two parts: the **planning docs** at the root, and a **live Next.js application** under `web/`. The build has started — `web/` is not a stub.

- `PRD.md` — the master product spec (numbered `##` sections 1–12: Product Overview, Users & Roles, Membership Lifecycle, Feature Domains, Information Architecture, Design System Summary, Data Model, Technical Architecture, Non-Functional Requirements, Phased Delivery Plan, Open Questions/Risks, Acceptance Criteria Summary).
- `docs/Nasiha_*.md` — supporting planning docs (Charter, Funding, KPIs, Knowledge Library, Member Communications, Member Onboarding, Membership Growth, Risk and Liability, Technology Roadmap).
- `system-design.md`, `ui-system.md`, `shadcn-blue-theme.md`, `lightning-landing-spec.md` — technical/design specs referenced from PRD.md §6 and §8. Each of `system-design.md`/`ui-system.md` ends with a "Claude Code Implementation Instructions" / "Implementation Rules for Claude Code" section — these describe *how* to build features (stack choices, component conventions), and remain useful as ongoing conventions now that the build is underway; they are not a one-time bootstrap script to re-run.
- `index.html`, `nasiha_lightning.html`, `nasiha_website_prototype.html` — static prototype mockups (GitHub Pages), not the live app. Useful as a visual/copy reference when building real pages, but not authoritative over PRD.md where they disagree (PRD.md is the later, reconciled spec).
- `web/` — the Next.js 14 (App Router) application. TypeScript, Tailwind, shadcn/ui, Prisma + PostgreSQL, Clerk auth, Redis (rate limiting), Resend (email). Has its own `package.json`, `npm install`/`npm run dev`/`npm run build`/`npm run lint`. Local Postgres/Redis run via the root `docker-compose.yml`; Prisma migrations live in `web/prisma/migrations`. See `web/README.md` for setup (including required Clerk dashboard steps).

Work happening in `web/` should follow the conventions in `system-design.md` and `ui-system.md` (domain boundaries, Prisma schema shape, RHF+Zod forms, shadcn primitives) and implement the behavior specified in `PRD.md`.

## Editing conventions

- PRD.md uses `§N` cross-references between sections (e.g. "(§4.14)"). When editing content that other sections cross-reference, update the cross-references too.
- When a change affects scope or design, keep **§11 Open Questions / Risks** and **§12 Acceptance Criteria Summary** in sync — add/resolve open questions and update acceptance checkboxes rather than leaving them stale.
- Commit directly to `main`; this repo doesn't use feature branches or PRs for doc edits. Application code in `web/` also commits directly to `main` (no PR workflow in place yet).
