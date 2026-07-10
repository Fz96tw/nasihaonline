# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is a **documentation/planning repo** for Nasiha, a membership platform — there is no application code yet, no package manager, and no build/test/lint commands. Do not attempt `npm install`, `make`, or similar; there is nothing to build.

- `PRD.md` — the master product spec (numbered `##` sections 1–12: Product Overview, Users & Roles, Membership Lifecycle, Feature Domains, Information Architecture, Design System Summary, Data Model, Technical Architecture, Non-Functional Requirements, Phased Delivery Plan, Open Questions/Risks, Acceptance Criteria Summary).
- `docs/Nasiha_*.md` — supporting planning docs (Charter, Funding, KPIs, Knowledge Library, Member Communications, Member Onboarding, Membership Growth, Risk and Liability, Technology Roadmap).
- `system-design.md`, `ui-system.md`, `shadcn-blue-theme.md`, `lightning-landing-spec.md` — technical/design specs referenced from PRD.md §6 and §8.
- `index.html`, `nasiha_lightning.html`, `nasiha_website_prototype.html` — static prototype mockups (GitHub Pages), not a live app.

`system-design.md` and `ui-system.md` each end with a "Claude Code Implementation Instructions" / "Implementation Rules for Claude Code" section describing how to generate the actual application (Prisma schema, API routes, UI components, etc.) once the build phase starts. These are **forward-looking instructions for a not-yet-started build**, not a description of existing code — don't act on them unless explicitly asked to begin implementation.

## Editing conventions

- PRD.md uses `§N` cross-references between sections (e.g. "(§4.14)"). When editing content that other sections cross-reference, update the cross-references too.
- When a change affects scope or design, keep **§11 Open Questions / Risks** and **§12 Acceptance Criteria Summary** in sync — add/resolve open questions and update acceptance checkboxes rather than leaving them stale.
- Commit directly to `main`; this repo doesn't use feature branches or PRs for doc edits.
