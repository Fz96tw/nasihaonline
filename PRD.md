# Nasiha — Product Requirements Document

**Status:** Draft v1.0
**Source materials:** `index.html` (interactive HTML prototype, source of truth for product behavior and content), `system-design.md` (technical architecture), `ui-system.md` (design system)
**Prepared:** 2026-07-07

---

## 1. Product Overview

### 1.1 What Nasiha Is

Nasiha ("sincere advice and guidance") is a **non-profit, invite/referral-driven global community** built around free, reciprocal knowledge exchange among professionals, students, and teachers — initially anchored in medicine/healthcare but structured to extend to other disciplines (science, law, business, IT).

The core mechanic: members earn **Knowledge Hours** by teaching, curating, and reviewing, and may spend Knowledge Hours to access expert time (consultations, mentorship). Critically, **Knowledge Hours are a recognition and reputation system, not an access gate** — every member retains full platform access regardless of balance.

### 1.2 Tagline & Positioning

> "Knowledge is better when we share what we know."

Positioning: a hybrid of a SaaS dashboard, a professional association portal, and a private knowledge network. Tone: modern, calm, premium, trusted, community-first — not clinical/sterile, not a generic social network.

### 1.3 Dedication

The platform carries a dedication — "NASIHA — Dedicated to Narjis and Syed Iftikhar Hussain Abidi, who guided us toward a life of learning" — surfaced on the About page and footer. This is a permanent content fixture, not a placeholder.

### 1.4 Goals (from system-design.md, confirmed against prototype)

- Build a member-based community ecosystem with tiered participation
- Track contribution via an immutable Knowledge Hours ledger
- Support expert discovery and networking via a searchable member directory
- Enable knowledge publishing (blogs) and discovery (resource library)
- Organize community events (webinars, workshops, case discussions) with RSVP
- Build trust through reputation, transparency of contribution history, and a deliberately staged admission process

### 1.5 Non-Goals (v1)

- Not a paid/subscription product — "no fees, just knowledge" is a stated principle; Knowledge Hours are never purchasable or convertible to currency.
- Not an open-signup platform initially — admission is gated (see §3.3).
- Not a general social network — no public feeds, likes, or follows outside the defined domains below.
- No unified/global search across all content types in v1 — Directory (§4.5) and Library (§4.9) each ship their own section-scoped search; a single global search box is deferred to a future phase (§4.16).

---

## 2. Users & Roles

### 2.1 System Roles (authz layer, from system-design.md)

```
guest       — unauthenticated visitor
applicant   — has submitted a membership application, pending review
member      — approved, authenticated user (see membership tiers, §2.2)
moderator   — content moderation + limited admin capability
admin       — full administrative access
```

### 2.2 Membership Tiers (member-facing classification, distinct from system role)

Every `member` belongs to exactly one tier, which drives directory badges, contribution expectations, and (for Friend) content scope:

| Tier | Label | Description | Access |
|---|---|---|---|
| `active` | Active Member | Regular contributors via teaching, reviewing, or research | Full access + governance voting rights |
| `associate` | Associate | Newer members establishing footing, growing toward Active | Full community access |
| `student` | Student / Trainee | Students/trainees; lighter contribution expectations | Full community access |
| `friend` | Friend of Nasiha | No contribution obligation | Free/public content only (events calendar, recorded webinars) — **not** full member access |

Tier is set by admin review (initial) and should later support admin-driven promotion (e.g., Associate → Active) based on contribution history — promotion workflow is out of scope for v1 but the data model must support it (see §7.3).

### 2.3 Personas

- **The Practicing Expert** (e.g., physician, 10+ yrs experience) — teaches via lectures/webinars, reviews others' work, occasionally spends hours for cross-specialty consultation. Cares about signal quality of the directory and low-friction content submission.
- **The Early-Career Professional** (Associate) — building reputation, consuming more than teaching initially, motivated by mentorship access and visibility in the directory.
- **The Student/Trainee** — heavy consumer of the library and events, lighter obligations, values a low-pressure on-ramp and forums with peers.
- **The Friend** — not a full member; wants free access to public events/recordings without any application friction. A conversion funnel target (Friend → Applicant).

---

## 3. Membership Lifecycle

### 3.1 Application Flow

```
visitor → submits application → applicant (pending)
        → admin review (approve/reject, admin notes)
        → approved → member (assigned a tier)
        → rejected → notified, may reapply per policy (TBD)
```

Application form fields (from prototype, `/apply`):
- First name, last name, email
- Professional title / specialty (free text)
- Career stage (select: Expert / Early Career / Student)
- Availability (select: Virtual Meeting / In-Person / Online Review)
- Area of interest (select: Healthcare / Science / Law / Business / IT)
- Country / region
- Referral (optional free text — name of referring member)
- Why do you want to join Nasiha? (long text)
- Areas of expertise to share (long text)
- Topics most want to learn (long text)
- **Professional reference (new):** name and contact info of a professional reference. The Charter requires "at least one professional reference" starting in the **Open Applications** phase (§3.2, phase 3); in the current Referral-Driven Growth phase it should be collected but treated as optional/soft — the field exists in the form now so it doesn't need to be added later as a breaking schema change, but form-level `required` validation should be tied to the active admission phase rather than hardcoded.

On submit: confirmation toast/state ("Application submitted, Board will review within 7 days") + application enters admin review queue. No email verification loop is shown in the prototype for applicants, but system-design.md requires email verification for the general Authentication Domain — apply it at account-creation time post-approval.

### 3.2 Admission Phases (product-level rollout, must be reflected in copy/config, not hardcoded)

1. **Founding Cohort — Invite Only** (complete): personally selected by founding members to establish culture/standards.
2. **Referral-Driven Growth — Current Phase**: existing members refer applicants; referral acts as a soft vouch. Referral field is optional but should be tracked for admin visibility (source-of-referral reporting).
3. **Open Applications — Future/Coming Soon**: unrestricted applications once community is established.

**Requirement:** the current phase must be a configurable value (admin-settable, e.g. a feature flag or settings table), not hardcoded text, since the product will progress through these phases over time and this is explicitly called out as "Current Phase" in the UI.

### 3.3 Review Workflow

```
submitted → under_review → approved | rejected
```

Models: `MembershipApplication`, `ApplicationReview`, `ApplicationAttachment` (attachments not present in the prototype form but included in system-design.md — retain for future CV/credential uploads).

Admin actions: approve (assign tier + create member account + trigger welcome email), reject (with admin notes, optionally visible to applicant), request more info (new state, recommended addition since ApplicationReview implies iterative review — **open question**, see §11).

### 3.4 Inactivity & Re-engagement

The Charter is explicit: **"No member will be removed solely for inactivity."** Inactive members are re-engaged, not purged. This needs to be a modeled lifecycle, not an ad hoc admin action:

- Track `lastActiveAt` on `User` (updated on login, contribution logged, RSVP, forum post, etc. — any meaningful action, not just page views).
- After an admin-configurable inactivity threshold (the Charter leaves the specific window to the Board — must be a settings value, not hardcoded), the system triggers a **"friendly nudge"** re-engagement notification/email — warm in tone, not a warning, consistent with the Charter's framing.
- No automatic tier downgrade, suspension, or removal is triggered by inactivity alone. Any such action requires explicit Board/admin decision, tracked separately (this is distinct from Code of Conduct enforcement, §4.15).
- Nudge history (sent dates, whether the member re-engaged afterward) should be visible to admins from `/admin/users`, both to avoid re-nudging too aggressively and to give the Board data on re-engagement effectiveness (feeds into the KPI dashboard, §4.11).

---

## 4. Feature Domains

Each domain below states: purpose, functional requirements grounded in the prototype, and data entities (per system-design.md, reconciled with prototype terminology).

### 4.1 Authentication

- Register (post-approval only — no self-serve signup), login, logout, forgot/reset password, email verification, session management.
- Demo/dev-only affordance in the prototype (quick-login as each tier) must **not** ship to production; replace with real credential auth.
- Server-side auth checks + RBAC on every member/admin route.
- Entities: `User`, `Account`, `Session`, `VerificationToken`.

### 4.2 Membership & Applications

- Public application form (§3.1), admin review queue, approve/reject actions with notes, tier assignment on approval.
- Admin list view with filter by status/phase/referral source.
- Entities: `MembershipApplication`, `ApplicationReview`, `ApplicationAttachment`.
- Routes: `POST /api/applications`, `GET /api/admin/applications`, `PATCH /api/admin/applications/:id`.

### 4.3 Profile

- Fields (from prototype `/profile`): full name, email, country/region, bio, title/specialty, career stage, areas of expertise (free text list), topics want to learn (free text list), avatar.
- **Profile photo upload (new):** a member may upload a profile photo. When set, it replaces the initials-based avatar everywhere an avatar is rendered — nav identity, profile hero, and, notably, the **Member Directory card thumbnail next to the member's name** (§4.5). When no photo is uploaded, the existing initials + brand-color fallback (from the prototype) is used, so photo upload is optional, not required at application/approval time.
  - Storage: MinIO `avatars/` bucket (already defined in system-design.md's File Storage Strategy), metadata (URL, upload date) on `Profile`; served via signed URL per the existing storage rules.
  - Upload constraints (see also §9): restrict to standard image types (JPEG/PNG/WebP), enforce a max file size, and generate a resized/cropped thumbnail server-side rather than serving the original upload at directory-card size.
  - Avatar sizing must follow ui-system.md's existing scale (`xs 24 / sm 32 / md 40 / lg 64 / xl 96`) — the directory card uses the `md`/`lg` size class, consistent with other avatar usages.
- Directory preferences: toggle "list me in Member Directory," toggle "show my specialty and location" — privacy controls must be respected by the Directory query.
- Entities: `Profile` (add `avatarUrl`), `Skill`, `ProfileSkill` (skills should be normalized/taggable rather than free text long-term, to power directory search/filter — prototype uses free text; recommend migrating to a tag model with free-text fallback for MVP-to-v2).
- Routes: `GET /api/profile`, `PATCH /api/profile`, `POST /api/profile/avatar` (upload), `GET /api/members`.

### 4.4 Knowledge Hours (Contribution Credit System)

This is the platform's differentiating mechanic. system-design.md's generic "Contribution Credit Domain" maps 1:1 to the product's "Knowledge Hours."

**Rules (hard requirements):**
- Immutable ledger — no direct balance mutation, ever.
- Balance = `SUM(all ledger transactions)` for a user, computed, never stored as a mutable field (a cached/denormalized balance column is acceptable for read performance but must be derived from and reconcilable against the ledger).
- Full audit trail on every transaction (actor, counterpart, timestamp, activity type, hour value).
- Knowledge Hours must never be purchasable, transferable for money, or a gate to core platform access (only exception: Friend tier's reduced scope, which is governance-based, not balance-based).

**Earning activities (from prototype, define as configurable `ContributionRule` records, not hardcoded):**
| Activity | Hours |
|---|---|
| Lecture / webinar delivered | 1.0 |
| Knowledge discussion | 0.5 |
| Curate a resource | 0.5 |
| Administrative volunteer work | variable (seen: 2.0) |

**Spending activities:**
| Activity | Hours |
|---|---|
| Expert consultation | 1.0 |
| Research resource / case discussion request | 0.5 |
| Attend webinar | Always free (not a spend event) |

**Transaction types:** `earned`, `spent`, `adjusted` (adjusted = admin correction, must require admin role + reason note for audit). **No `transferred` type** — the Charter explicitly prohibits Knowledge Hours being "transferred, gifted, or sold between members"; an earlier draft of this PRD included a `transferred` type that directly conflicted with this rule and has been removed. Nothing in the data model should allow one member's balance to be moved to another member's balance outside the normal earn/spend/admin-adjust flows.

**How entries get posted (hybrid model — resolves the ambiguity left open in earlier drafts):**

Every ledger transaction has a `status`: `pending` → `confirmed` | `rejected`. Only `confirmed` transactions (including auto-posted ones, which are confirmed by construction) count toward the balance and lifetime totals; `pending` items are visible to the member as "awaiting confirmation," and `rejected` items remain in the audit trail (never deleted) but contribute 0 to the balance.

- **Auto-posted (no human confirmation step, because the system already has ground truth):**
  - Hosting an event with recorded `Attendance` (§4.6) → auto-earn for the host on event completion, using the matching `ContributionRule` rate.
  - An **accepted meeting request** (§4.7, Inbox) → auto-spend for the requester at acceptance time (e.g., Expert Consultation, 1.0 hr).
- **Self-reported, then confirmed:** everything without a system-of-record trigger (curating a resource, an ad-hoc knowledge discussion not tied to a formal Event, administrative volunteer work, etc.) is submitted by the member via the "Log Contribution" form (activity type, optional counterpart, optional note) and enters as `pending`.
  - If a **counterpart** is named on the submission, that counterpart can confirm or reject it directly (peer confirmation) — no admin involvement needed for routine peer-to-peer activity.
  - If there's **no counterpart** (e.g., solo resource curation), it requires **admin confirmation** from `/admin/ledger`.
  - This keeps the ledger auditable without an admin becoming a bottleneck for every transaction, while still gating anything unverifiable behind a second party.

**UI requirements (member-facing `/contributions`):**
- Summary bar: current balance (confirmed only), lifetime earned, lifetime spent, "Log Contribution" primary action.
- Full transaction history table: date, activity description, counterpart (person, if applicable), hours (signed, color-coded positive/negative), and status (confirmed / pending / rejected) — pending and rejected rows visually distinct from confirmed ones.
- Nav badge showing live **confirmed** balance ("✦ N Knowledge Hours") next to the user's identity, always visible when authenticated.

Entities: `ContributionLedger` (add `status`), `ContributionEvent`, `ContributionRule`.
Routes: `POST /api/contributions/earn`, `POST /api/contributions/spend`, `GET /api/contributions/history`, `POST /api/contributions/:id/confirm`, `POST /api/contributions/:id/reject` (counterpart or admin).

### 4.5 Member Directory

- Grid of member cards: avatar thumbnail next to the member's name — the member's uploaded profile photo if set, otherwise the initials + brand-color fallback (§4.3) — title, country, tier badge, expertise tags, and two actions — **"Send Message"** and **"Request Meeting"** (both open into the Inbox domain, §4.7; there is no live chat entry point from the directory).
- Search: free-text across name, title, country, expertise.
- Filter: by tier (All / Active / Associate / Student-Trainee) — note Friend tier is intentionally excluded from directory filters/listing per the tier's reduced-access design.
- Must respect per-user directory visibility preference (§4.3).
- Entity: derived from `Profile` + `User`; no separate directory entity needed. Search index: Meilisearch, indexed on profile fields.
- Route: `/members`.

### 4.6 Events & Calendar

- Public events page (unauthenticated-visible): list of upcoming events, each flagged `open` (free/public) or members-only. Public CTA to join if members-only.
- Member calendar: month-grid calendar view + linear upcoming-events list, RSVP and "Add to calendar" actions per event.
- Event metadata: title, type (Webinar / Workshop / Case Discussion / Student Event / Roundtable / Lecture, extensible enum), host, date/time (must store as UTC + display with locale/timezone conversion — prototype hardcodes "UTC" labels, real system needs proper timezone handling), open/members-only flag, icon/category, **meeting/video link** (new — a URL field for the actual session, e.g. Zoom/Google Meet; per Technology_Roadmap.md the org runs live sessions on Zoom/Meet rather than a built-in video system, so Nasiha's platform hosts the event *listing and RSVP*, not the video call itself; only visible to RSVP'd members, not on the public `/events` listing).
- Event submission by members ("Submit Event" action — implies an event-creation permission, likely gated to Active tier or above — **needs explicit rule**, see §11).
- **De-identification confirmation (new):** submitting a **Case Discussion** type event requires an explicit checkbox — "I confirm no identifiable patient information will be shared" — before the event can be published. This mirrors the same requirement on Knowledge Library case-study submissions (§4.9) and is a hard requirement from the Charter's Code of Conduct and Risk_and_Liability.md, not optional guidance.
- Entities: `Event` (add `meetingUrl`, `deidentificationConfirmed`), `EventRecurrence`, `RSVP`, `Attendance`.
- Recording `Attendance` for an event's host is the trigger for an auto-posted Knowledge Hours earn transaction (§4.4) — no separate manual step needed for hosting.
- UI tool: FullCalendar (per system-design.md).
- Routes: `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id`, `POST /api/events/:id/rsvp`.
- Public route: `/events`. Member route: `/calendar`.

### 4.7 Inbox (Messages & Meeting Requests)

**Correction vs. system-design.md:** there is no peer-to-peer direct-messaging/chat feature (no live conversation threads, no typing indicators, no presence). Messaging is **inbox-based**, one level removed from a live DM system, and it is entered exclusively from the Member Directory:

1. A member finds another member in the Directory.
2. From that member's card/profile, they can either:
   - **Send a Message** — a single asynchronous message delivered to the recipient's inbox, or
   - **Request a Meeting** — a structured request (proposed topic + one or more proposed times) delivered to the recipient's inbox as a distinct, actionable item.
3. The recipient sees both message and meeting-request items in their Inbox, can reply (replies thread under the original item, email-style — not real-time), and, for meeting requests, can **accept**, **decline**, or **propose a new time**.

**Why this matters for the ledger:** an accepted meeting request is the natural trigger for a Knowledge Hours "spend" transaction (e.g., Expert Consultation, 1.0 hr) — the Inbox and Contribution Credit domains should be linked at the meeting-acceptance step, not left as two disconnected features. Simple messages do not touch the ledger.

**Functional requirements:**
- Inbox lists received and sent items (messages + meeting requests) with read/unread state, sortable by most recent activity.
- Meeting requests carry an explicit status: `pending → accepted | declined | rescheduled`.
- No requirement for real-time delivery (Socket.IO/typing indicators/presence are **not needed**); new-item notification can be handled entirely through the existing Notification domain (§4.10) — in-app + email — on a request/response cycle rather than a persistent socket connection.
- Attachments and read receipts (per system-design.md) still apply, scoped to individual inbox items rather than a live thread.

**Entities:** `InboxMessage` (sender, recipient, subject/body, parent item for threaded replies, read state), `MeetingRequest` (sender, recipient, proposed topic, proposed time(s), status, optional linked `ContributionLedger` transaction on acceptance). This replaces system-design.md's `Conversation`/`Participant`/`MessageReadReceipt` realtime model — recommend simplifying the DB schema accordingly (no conversation/participant join tables needed since every thread is strictly two-party and directory-originated).

**Routes:** `GET /api/inbox`, `POST /api/inbox/messages`, `POST /api/inbox/meeting-requests`, `PATCH /api/inbox/meeting-requests/:id` (accept/decline/reschedule).

**UI:** single inbox list view (not a 3-column live-chat layout) with a detail pane per selected item; mobile collapses to a single column (list → detail on tap, back to return).

**Gating question:** should Friend-tier users be reachable via the directory / able to use the inbox? Default assumption: no (full-member feature only, and Friend tier isn't listed in the directory at all per §4.5) — confirm before build.

### 4.8 Blog

- Member-authored posts, list view as cards (author avatar, tag/category badge, title, excerpt, date, hero image optional — falls back to an icon tile on brand-pale background when no image).
- Filter by topic/category (chips: Cardiology, Education, Research, Global Health, Oncology, Mental Health — should be a managed taxonomy, not hardcoded).
- "Write a Post" action opens an editor (Tiptap per system-design.md).
- **Content licensing consent (new):** publishing a post requires a one-time (or per-post) acknowledgment of Nasiha's content terms — the author retains IP ownership of what they write, and by publishing grants Nasiha a non-exclusive right to make it available to the membership (and public, for `/blog`). This is a Risk_and_Liability.md requirement, not optional — see §4.15.
- Comments supported per data model (not shown in prototype UI but required per system-design.md).
- Entities: `Post`, `PostCategory`, `PostTag`, `PostComment`.
- Routes: `/blog`, `/blog/[slug]` (public-readable; write requires member auth).

### 4.9 Knowledge Library

- Searchable, filterable resource repository: recorded lectures, articles/summaries, case studies, guidelines.
- Filters: content type, specialty, career-stage level (Student-Friendly / Early Career / Advanced / All Levels).
- Card metadata: contributor, category/specialty, file type icon, upload date, description.
- "Submit Resource" action for members.
- **Library Steward review workflow (new):** submitted resources do **not** publish immediately — they enter `pending_review`. A **Library Steward** (a volunteer member holding the `moderator` role, §2.1, ideally one per specialty area at scale) reviews for quality, correct tagging, and disclaimer/de-identification compliance before publishing. Only `published` items appear in search/browse; `pending_review` items are visible to their submitter (with status) and to Stewards/admins on a review queue.
- **Community flagging (new):** any member can flag a published item as inaccurate or outdated. Flagged items are reviewed by a Steward and, if needed, escalated to the Board — flagged items stay visible (not auto-hidden) unless a Steward removes them, consistent with Knowledge_Library.md's "community flagging, not formal peer review" quality model.
- **De-identification confirmation (new):** submitting a **case study** type resource requires the same explicit confirmation checkbox as case-discussion events (§4.6) — "I confirm all patient information has been de-identified" — before it can enter review.
- **Content licensing consent (new):** same one-time/per-submission IP consent as Blog (§4.8) — contributor retains ownership, grants Nasiha a non-exclusive right to display it to the membership (see §4.15).
- Preview: PDF.js for document types (per system-design.md). **Recorded lectures (new decision):** hosted on Nasiha's own YouTube channel (unlisted or public, per org preference), not stored as binaries — a submitted "recorded lecture" resource is a YouTube URL/video ID plus the same metadata (contributor, specialty, description, de-identification/licensing consent) as any other library item, previewed via a standard YouTube embed rather than a custom player. This mirrors the Events domain's existing pattern (§4.6) of Nasiha hosting the *listing*, not the media itself — Zoom/Meet for live sessions, YouTube for recordings.
- Entities: `KnowledgeItem` (add `status`: `pending_review` / `published` / `flagged` / `rejected`, `deidentificationConfirmed`, `licenseConsented`; recorded-lecture items store `youtubeUrl` instead of a `KnowledgeAttachment`), `KnowledgeCategory`, `KnowledgeTag`, `KnowledgeAttachment` (documents/articles/case studies only — not video).
- Storage: MinIO (document/article binaries only — no video) + PostgreSQL (metadata) + Meilisearch (search index — index only `published` items).
- Routes: add `GET /api/admin/library/review-queue`, `POST /api/library/:id/flag`, `POST /api/admin/library/:id/publish` alongside the existing library routes.
- Route: `/library`.

### 4.10 Notifications

Not visible in the HTML prototype's UI chrome but required per system-design.md; toasts in the prototype (e.g., "Registered for event!") are a proxy for what should become real, persistent, multi-channel notifications.

- Types: new inbox message, meeting request (received / accepted / declined / rescheduled), event reminder, membership update (application approved/rejected), blog comment, forum reply/mention, contribution awarded, resource review update (a submitter's item published/rejected). Digest and Board Announcement (below) are also first-class types, delivered on their own batching/broadcast rules rather than per-item.
- **Digest (new):** a periodic (frequency TBD by the Board, per Member_Communications.md) community digest — top discussions, new library resources, upcoming events, member spotlights — batched rather than sent as individual notifications, to avoid inbox overload. Members can control digest frequency via `NotificationPreference`.
- **Board Announcement (new):** a distinct broadcast type for infrequent, org-wide messages issued by the Board/Officers (organizational updates, milestones) — deliberately rare and high-signal, not a general-purpose blast channel. Only admin/board-role users can send these; every member receives them regardless of other notification preferences (cannot be opted out of, consistent with Member_Communications.md's framing that these should "carry weight").
- Channels: in-app (homegrown `Notification` feed + read/unread API, no third-party notification vendor — see §8) + email (Resend). Digest batching runs as a BullMQ scheduled job (§10, Phase 6) rather than a vendor's built-in digest engine, so a notification-orchestration platform like Novu wouldn't be pulling its weight here.
- Entities: `Notification`, `NotificationPreference` (must allow per-type opt-out, except Board Announcements), `Announcement` (new — board-authored broadcast content: title, body, author, sent-at; a Board Announcement notification references one of these).

### 4.11 Admin

Not present in the HTML prototype (no `/admin` UI was built), but required per system-design.md for the platform to be operable:

- User management, content moderation, event management, contribution ledger auditing (including manual `adjusted` transactions), application review queue.
- Tool: AdminJS.
- Routes: `/admin`, `/admin/users`, `/admin/applications`, `/admin/content` (shared flagged-content moderation queue — published Blog posts, published Library items post-publish flags, and Forum posts, per §4.13's "one shared moderation queue, not a separate one per domain"; distinct from `/admin/library/review-queue`, which handles pre-publish review, not post-publish flags), `/admin/events`, `/admin/ledger`, `/admin/team` (§4.12), `/admin/reports`, `/admin/library/review-queue` (§4.9), `/admin/conduct` (§4.15), `/admin/privacy-requests` (§4.15), `/admin/donations` (§4.14 — view/export donation records; read-only with respect to `ContributionLedger`/`users.tier`, preserving the structural separation).
- Admin nav items (per ui-system.md): Users, Applications, Content, Events, Ledger, Reports. Extend this list with **Team** (§4.12), **Library Review Queue** (§4.9), **Conduct** (§4.15), **Privacy Requests** (§4.15), and **Donations** (§4.14) — all five have dedicated admin routes but were missing from the nav list in earlier drafts.
- **This is a build gap vs. the prototype and should be treated as P0/critical-path** — approvals, tier assignment, and ledger adjustments are impossible without it.

**Reports / KPI dashboard (fleshed out from `Nasiha_KPIs.md`, which previously left the "Reports" nav item unspecified):**

`/admin/reports` should surface the four metric groups the org has already defined, computed from existing entities rather than requiring new tracking infrastructure:

| Group | Metrics | Source |
|---|---|---|
| Community Health | Total recently-active members (any member with activity in the past quarter, regardless of tier — not to be confused with the `active` membership tier, §2.2), retention rate (YoY), geographic diversity (countries represented), new members/quarter, student & trainee representation | `users`, `profiles.country`, `membership_applications` |
| Knowledge Exchange Activity | Lectures/webinars per month, case discussions per month, total Hours earned/spent, earn:spend ratio, unique contributor-recipient pairings, resources shared | `events`, `contribution_ledger`, `knowledge_items` |
| Impact | Member satisfaction (periodic survey — needs a lightweight survey mechanism, not yet modeled elsewhere), trainee → Active progression rate, repeat engagement rate | `users.tier` history (§7.3 tier-promotion history), survey tool TBD |
| Organizational Health | Budget adherence (out of platform scope — financial tooling, not this system), application turnaround time, Code of Conduct incident count/resolution (§4.15), ledger accuracy (reconciliation check, §7.1) | `membership_applications` timestamps, `code_of_conduct_violations` (§4.15) |

Impact metrics require self-reported survey data that isn't otherwise generated by the system — flag this as needing its own lightweight feedback mechanism (e.g., a periodic in-app prompt) rather than assuming it falls out of existing entities for free.

### 4.12 Our Team

A new public page introducing the people behind Nasiha — founders, board members, and partners — in a single combined grid (not split into separate Founders/Board/Partners sections). This supersedes the "Founded By" section previously on the homepage (removed in commit `151a8b2`), which only showed initials avatars, name, and a one-line title for three people. The new page is intentionally richer: real photos and a bio paragraph per person, in a standard professional executive-team-bio layout.

**Page structure:**
- Page hero (consistent with other public pages — About, How to Join — per the `.page-hero` pattern in the prototype's CSS): title "Our Team" + short intro line.
- Grid of team member cards. Each card: photo (falls back to initials + brand color if no photo uploaded, same convention as member avatars), name, **role badge** (`Founder` / `Board Member` / `Partner` — visually distinguished, e.g. using the existing badge component variants from ui-system.md), title/affiliation line (e.g. "Physician," "Technology Executive"), and a bio paragraph (2–4 sentences).
- Grid sort order is admin-controlled (explicit `display_order`, not alphabetical or role-grouped), so the org can control who appears first (e.g., founders first by convention, without the page being hard-split into sections).

**Content management:** team member records are **admin-manageable**, not hardcoded — consistent with how other public-facing lists (events, blog posts, library items) are data-backed with admin CRUD in system-design.md, rather than living as static marketing copy. This lets the org add/remove partners or update bios without a code deploy.

**Entity:** `TeamMember` — `name`, `roleBadge` (enum: `founder` / `board_member` / `partner`), `title` (free text, e.g. "Physician," "Technology Executive"), `bio` (text), `photoUrl` (nullable, same MinIO `avatars/`-style storage and upload validation as profile photos, §4.3/§9), `displayOrder` (integer), `active` (boolean — allows retiring a team member from the public page without deleting their record).

**Admin requirements:** add, edit, remove, and reorder team members from `/admin/team` — extends the Admin Domain (§4.11).

**Navigation:** "Our Team" appears in the public navbar immediately after "About" (About → Our Team → How to Join → Events → Blog → Contact), and in the footer's Community column alongside About / How to Join / Events / Join NASIHA / Contact Us.

**Routes:** `GET /api/team` (public, active members only, ordered by `displayOrder`), `GET/POST/PATCH/DELETE /api/admin/team` (admin CRUD).

### 4.13 Discussion Forums

`Member_Communications.md` describes this as **"the primary space for asynchronous, community-wide interaction"** — a gap in the prior PRD, since no forum functionality existed anywhere in the feature domains.

**Structure:** topic-based forums, seeded with six categories from the source doc:

| Forum | Purpose |
|---|---|
| General | Community announcements, introductions, open discussion |
| Clinical Discussions | Case-based learning, diagnostic questions, treatment approaches |
| Research & Resources | Sharing articles, tools, guidelines, curated learning materials |
| Teaching & Mentorship | Advice on teaching, mentorship requests, pedagogical discussion |
| Students & Trainees | Dedicated space for early-career members |
| Organizational | Board updates, policy discussions, credit system questions |

Categories should be admin-manageable (not hardcoded), same rationale as Our Team (§4.12) and Events — an org this size will want to add/retire categories over time.

**Norms (enforced, not just documented):**
- All posts are visible to the full membership (no private/DM-style forums in v1).
- Commercial promotion, job postings, and fee-based service offers are **not permitted** — this needs actual moderation tooling (flag + remove), not just a written policy, tying into Code of Conduct enforcement (§4.15).
- Members can **follow** specific forums and receive **digest** updates (§4.10) instead of a notification per post, to avoid inbox overload — this is an explicit anti-pattern the source doc calls out ("notification overload").
- Case-discussion threads in Clinical Discussions carry the same de-identification requirement as Library case studies and Case Discussion events (§4.6, §4.9) — patient information must never appear in a forum post.

**Entities:** `Forum` (category), `ForumThread` (title, author, forum, created date, pinned flag), `ForumPost` (thread, author, body, created date — top-level posts and replies are the same entity, threaded by `parentPostId`).

**Moderation:** forum moderation uses the existing `moderator` role (§2.1); flagged posts route the same way as flagged Library content (§4.9) — one shared moderation queue, not a separate one per domain.

**Routes:** `GET /api/forums`, `GET /api/forums/:forumId/threads`, `POST /api/forums/:forumId/threads`, `POST /api/forums/threads/:threadId/posts`, `POST /api/forums/posts/:postId/flag`.

**Navigation:** add "Forums" to the Member Navigation (sidebar), alongside Directory/Calendar/Blogs — this is core community infrastructure, not a peripheral feature.

**IA:** `/forums`, `/forums/[category]`, `/forums/[category]/[threadId]`.

### 4.14 Donations

`Nasiha_Funding.md` and `Technology_Roadmap.md` both call for a donation capability that the prior PRD had no page or feature for.

**Public donation page (`/donate`):** open to anyone, member or not — a way for supporters to contribute financially to the Organization, separate from the Knowledge Hours exchange.

**Member-facing option:** a voluntary annual contribution prompt, low-pressure and infrequent (per Funding.md's explicit guidance to never make members feel obligated) — surfaced from `/contributions` or `/settings`, not as a persistent nag.

**Hard rule (from Funding.md's "What to avoid"):** donations confer **no advantage** in the Knowledge Hours system or membership tier. There is no "donor tier." This must be enforced structurally — a `Donation` record has no relationship to `ContributionLedger`, `users.tier`, or any access-control check anywhere in the system.

**Recognition:** significant donors may be named in the community digest (§4.10) and annual report (an offline/organizational artifact, not a platform feature) at the donor's opt-in preference — a `recognitionConsent` flag on the donation record, not automatic public listing.

**Entity:** `Donation` — donor name/email (or linked `User` if the donor is a member), amount, date, one-time vs. recurring, `recognitionConsent` (boolean), optional note (e.g., "in honor of..."). Institutional/sponsor-tier partnerships (Community/Supporting/Founding Partner, per Funding.md) are a related but distinct concept from an individual donation and from the Our Team "Partner" role badge (§4.12) — **not resolved in this pass** (flagged separately, out of scope for this round of changes); this section covers individual/one-off donations only.

**New infrastructure requirement:** none of the existing tech stack (§8) includes a payment processor. A donation page needs one (e.g., Stripe) added to the stack — this is a new dependency, not something covered by the current architecture.

**Routes:** `POST /api/donations` (public), `GET /api/admin/donations` (admin — list/export donation records with recognition-consent flag visible; no write path back into `ContributionLedger` or `users.tier`). **IA:** `/donate` (public), `/admin/donations` (admin, §4.11) — without this, a donation is a write into a black hole nobody on the org side can see.

### 4.15 Trust & Safety / Compliance

Several requirements from the Charter and `Nasiha_Risk_and_Liability.md` are treated as **hard pre-launch requirements** in the source docs but had no representation anywhere in the prior PRD. Grouped here rather than scattered, since they're all governance/legal-compliance concerns with overlapping infrastructure (the disclaimer and de-identification/IP-consent items already added to §4.6/§4.8/§4.9 are cross-referenced from here, not duplicated).

**1. Standard educational disclaimer.** Must appear on all platform pages and communications, not just a one-time acceptance:
> *"Nasiha is an educational knowledge-sharing community. Content shared by members — including lectures, case discussions, consultations, and forum posts — is intended for professional learning purposes only and does not constitute medical advice. Members are responsible for exercising independent clinical judgment in their own practice. Nasiha and its members accept no liability for clinical decisions made based on content shared within the community."*
Implementation: a persistent, site-wide footer disclaimer component (all public and member pages), plus the same text (or a shortened form) attached to Library content, Events of type Case Discussion, and Forum Clinical Discussions posts.

**2. Code of Conduct acceptance + enforcement.** The Charter defines seven Code of Conduct principles (share honestly, give generously, receive graciously, engage respectfully, protect privacy, uphold the mission, report concerns) with a two-strike enforcement ladder: first violation → formal warning; second or serious violation → suspension or removal, at Board discretion.
- **Acceptance:** required as an explicit checkbox at application submission (§3.1) or first login post-approval — not buried in a terms-of-service link.
- **Reporting:** any member can report a concern about another member (a lightweight "report" action, distinct from content-flagging in §4.9/§4.13, since this is about a *person's conduct*, not a specific piece of content).
- **Enforcement tracking:** `CodeOfConductViolation` entity — reported member, reporter (may be system-flagged, not always a named member), description/evidence note, action taken (`warning` / `suspension` / `removal`), handling admin, date. Warnings and suspensions should be visible to the affected member and to admins reviewing future incidents (to correctly apply "second violation" escalation) but never publicly visible.
- **Suspension** is a new `User` state distinct from tier — a suspended member cannot log in / access member routes but their historical contributions and content remain in the system (immutable ledger, per §4.4).

**3. Privacy Policy + data rights.** Required before public launch per Risk_and_Liability.md, especially given GDPR exposure from international operation:
- A public `/privacy` page describing what data is collected, how it's used, and how members can request access, correction, or deletion.
- A member-facing **data request** flow (from `/settings`) to request export or deletion of personal data — routed to an admin/Privacy Lead role for fulfillment (the Charter specifies the Board appoints a Privacy Lead; this maps to an admin permission, not a new system role).
- Deletion requests interact with the immutable ledger requirement (§4.4): personal profile data can be deleted/anonymized, but historical ledger transactions and content attribution may need to be retained in de-identified form for audit integrity — this tension should be resolved in the formal Privacy Policy, not silently in code.

**Entities:** `CodeOfConductViolation`, `PrivacyDataRequest` (user, type: `export`/`deletion`, status, requested date, fulfilled date, handled by).

**Routes:** `POST /api/conduct/report`, `GET/PATCH /api/admin/conduct` (admin), `POST /api/privacy/data-request`, `GET/PATCH /api/admin/privacy-requests` (admin). **IA:** `/privacy` (public).

---

### 4.16 Global Search (Future / Post-MVP)

MVP ships **section-scoped** search only: the Member Directory (§4.5) and Knowledge Library (§4.9) each have their own search box over their own data. There is no single, site-wide search.

**Requirement for a future phase:** a global search box in the main nav (present on both public and member layouts) that queries across all searchable content types in one place — profiles, blog posts, knowledge library items, and forum threads/posts — and returns categorized results (grouped by type, e.g. "Members," "Blog," "Library," "Forums") rather than one flat list. Should respect the same visibility rules already required per-domain (e.g. a member excluded from the Directory per their `list_in_directory` preference, §4.3/4.5, must not surface in global search either; only `published` knowledge items, §4.9, are eligible).

Not scoped for MVP — tracked here so it isn't lost, and to flag the infrastructure implication in §7.2 (forums are not yet part of any search index, and a global query needs either a federated multi-index search or a combined index with a `type` field to distinguish results).

---

## 5. Information Architecture / Routing

### Public
```
/                    Home (hero, how-it-works, knowledge exchange explainer, tiers, CTA)
/about               Mission, values, vision, dedication, "what we do"
/our-team            Founders, board members, and partners — combined grid with role badges, photo + bio per person (§4.12)
/how-to-join         Admission phases, tier explainer, eligibility, CTA
/events              Public event list (RSVP requires membership)
/blog
/blog/[slug]
/join (apply)        Membership application form
/login
/forgot-password
/contact             Contact form
/donate              Public donation page (§4.14)
/privacy             Privacy Policy (§4.15)
```

### Authenticated (Member)
```
/dashboard           Stats row (hours balance, lifetime earned, sessions contributed, total member count —
                     not live "members online" presence, no realtime infra per §8), upcoming events widget,
                     recently-added library widget
/profile             Personal + professional info, directory preferences
/contributions       Knowledge Hours balance, lifetime stats, transaction history, log-contribution action
/members             Directory: search + tier filter; each member card links out to message/request-meeting
/inbox               Inbox list (messages + meeting requests, sent & received) / item detail pane
/calendar            Month grid + upcoming events list, submit-event action
/library             Search + filters (type, specialty, level), resource cards
/forums              Forum category list (§4.13)
/forums/[category]   Thread list for a forum category
/forums/[category]/[threadId]  Thread detail + replies
/blog (write access) Same routes as public, plus authoring
/settings            Notification/digest preferences, password change, data export/deletion request (§4.15)
```

### Admin
```
/admin
/admin/users
/admin/applications
/admin/content         Shared flagged-content queue: Blog, published Library flags, Forums (§4.11)
/admin/events
/admin/ledger
/admin/team
/admin/reports        KPI dashboard (§4.11)
/admin/library/review-queue   Library Steward pre-publish review queue (§4.9)
/admin/conduct         Code of Conduct violation tracking (§4.15)
/admin/privacy-requests  Data export/deletion request fulfillment (§4.15)
/admin/donations       Donation records, recognition-consent visibility (§4.14)
```

Note: system-design.md's route list uses `/join` for the application form; the prototype implements this as `/apply` in its JS routing (`navigate('apply')`). **Reconcile naming before implementation** — recommend `/join` to match system-design.md and the "Join NASIHA" CTA copy used everywhere.

---

## 6. Design System Summary

Full spec lives in `ui-system.md`; key tokens are restated here since they gate visual acceptance criteria for every feature above.

**Brand colors:** Primary `#2563EB` / hover `#1D4ED8` / pale `#DBEAFE` (soft `#EFF6FF`+`#DBEAFE` in the prototype's two-step pale system). Accent gold `#F59E0B`/`#D97706` used specifically for the Knowledge Hours currency and "Free"/highlight badges. Success `#16A34A`, Warning `#D97706`, Danger `#DC2626`.

**Tier colors (prototype-specific, not in ui-system.md — must be preserved):**
- Active `#2563EB` (primary blue)
- Associate `#7C3AED` (violet)
- Student/Trainee `#0891B2` (cyan)
- Friend `#6B7280` (gray)

**Typography:** Inter (primary + secondary), JetBrains Mono (monospace). Scale: H1 36/700, H2 28/600, H3 22/600, Body-lg 18/400, Body 16/400, Small 14/400, Tiny 12/400.

**Spacing:** 4px base unit; card padding 24px, page padding 32px, section gap 32px, component gap 16px.

**Radius:** small 6px (buttons), medium 10px (cards), large 14px (modals).

**Layouts:**
- Public: navbar + hero + sections + footer, max-width 1280px, content width 960px.
- App (member): sidebar (280px, collapsed 72px) + topbar + content.
- Admin: sidebar + topbar + dense table-first content, density over aesthetics.

**Component & state rules:** buttons (primary/secondary/outline/ghost/destructive × sm/md/lg, primary reserved for the single most important action per view); cards support header/body/footer/action slot; tables collapse to card-stacks under 640px; all async states need skeleton loaders, and every page needs defined empty/error/success states (friendly message + retry for errors, explanation + primary action for empty).

**Forms:** labels always visible (no placeholder-as-label); inline validation as the user types or on blur, not only on submit; clear, specific error states next to the offending field, not a generic banner; related fields grouped into sections (per ui-system.md). This is the rule referenced by upload-validation and consent-checkbox requirements elsewhere in this document (§9, §4.15).

**Accessibility:** keyboard navigation, visible focus states, ARIA labels, semantic HTML, AA color contrast — required on all buttons, modals, forms, nav menus.

**Theme preservation directive (explicit in ui-system.md):** do not redesign from scratch, do not change information hierarchy, do not over-simplify layouts — the prototype's card hierarchy, spacing, section order, density, and "premium" feel are the target, just rebuilt as reusable, data-driven components.

---

## 7. Data Model (consolidated)

Core tables (system-design.md, confirmed against prototype's implied entities):

```
users, accounts, sessions, verification_tokens,
profiles, skills, profile_skills,
membership_applications, application_reviews, application_attachments,
contribution_ledger, contribution_events, contribution_rules,
events, event_recurrences, rsvps, attendance,
inbox_messages, meeting_requests,
posts, post_categories, post_tags, post_comments,
knowledge_items, knowledge_categories, knowledge_tags, knowledge_attachments,
notifications, notification_preferences,
team_members,
forums, forum_threads, forum_posts,
donations,
code_of_conduct_violations, privacy_data_requests,
announcements
```

(`accounts`/`sessions`/`verification_tokens` are Auth.js's standard tables, §4.1; `contribution_rules` also appears in §7.3 as a "recommended addition" — the two references describe the same table, not two different ones.)

### 7.1 Notes from prototype reconciliation

- `users.tier` (active/associate/student/friend) is a first-class field distinct from `users.role` (guest/applicant/member/moderator/admin) — both are needed.
- `contribution_ledger` balance must be derivable via `SUM(transactions WHERE user_id = ? AND status = 'confirmed')`; do not store balance as the sole source of truth. Every row needs a `status` (`pending`/`confirmed`/`rejected`) per the hybrid auto/self-report/confirm model in §4.4 — rejected rows stay for audit but are excluded from the sum.
- Directory visibility requires two booleans on `profiles` (or a JSON prefs blob): `list_in_directory`, `show_specialty_location`.
- Event `open` boolean (public/free vs. members-only) is required on `events`.
- `profiles` needs an `avatar_url` field (nullable) pointing to the MinIO-stored profile photo; absence of a value is the signal to render the initials fallback (§4.3) — this is a display rule, not a separate "has photo" flag.
- `conversations`/`messages` (system-design.md's realtime DM tables) are **replaced** by `inbox_messages` + `meeting_requests` (§4.7) — no participant/conversation join table is needed since every thread is two-party and always originates from the Directory.
- `team_members` (§4.12) is unlike the rest of the public marketing content (Home/About/How-to-Join copy, which is static): it's admin-CRUD-backed, closer in shape to `events`/`posts`/`knowledge_items` than to hardcoded page copy.
- `knowledge_items` needs a `status` field (`pending_review`/`published`/`flagged`/`rejected`, §4.9) — same pattern as the ledger's `status` field; only `published` items are searchable/browsable.
- `events` needs `meeting_url` and `deidentification_confirmed` fields (§4.6); `knowledge_items` needs `deidentification_confirmed` and `license_consented` fields (§4.9); `posts` needs `license_consented` (§4.8).
- No `transferred` transaction type on `contribution_ledger` (§4.4) — removed for a direct conflict with the Charter's prohibition on transferring credits between members.
- `donations` (§4.14) has **no foreign key or join to `contribution_ledger` or `users.tier`** — this is a structural guarantee that donating never confers Knowledge Hours or tier advantage, not just a UI convention.
- `code_of_conduct_violations` introduces a new `User` state (`suspended`), distinct from `tier` — suspension blocks login/access but does not delete or alter historical ledger/content records (§4.15).

### 7.2 Search indexes (Meilisearch)

Indexed domains: `profiles`, `posts`, `knowledge_items`, `events`. Sync strategy: DB write → queue event (BullMQ) → worker updates index.

**Future (global search, §4.16):** extending search beyond MVP's section-scoped Directory/Library boxes to a single global search box means adding `forum_threads`/`forum_posts` to the indexed domains above, and choosing a federation strategy — either separate per-type Meilisearch indexes queried in parallel and merged client-side, or one combined index with a `type` discriminator field.

### 7.3 Recommended additions beyond system-design.md (gaps found during reconciliation)

- `admission_phase` config/settings record (current phase is product-visible copy, must be admin-editable — see §3.2).
- `contribution_rules` should be a managed table (activity type → hour value), not hardcoded, since the prototype already implies a small fixed rate card that will need tuning over time.
- Tier-promotion history (audit of tier changes with actor + reason) — supports the "growing toward Active status" narrative on the Associate tier description.

---

## 8. Technical Architecture (reference: system-design.md)

| Layer | Choice |
|---|---|
| Frontend framework | Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui |
| Forms/validation | React Hook Form + Zod |
| Client state / data | Zustand, TanStack Query |
| API | Next.js Route Handlers, service + repository layers |
| ORM / DB | Prisma / PostgreSQL |
| Cache | Redis |
| Queue | BullMQ (email, notification, search-index, cleanup queues) |
| Realtime | Socket.IO + Redis pub/sub — **not required for Inbox messaging** (§4.7, which is request/response, not live chat); retained in the stack only if/when a genuinely realtime feature is added (e.g. live presence or push-on-arrival for Inbox items, currently handled via the Notification domain instead) |
| Search | Meilisearch |
| Object storage | MinIO (avatars/, documents/, attachments/, event-assets/ buckets; metadata always in Postgres; serve via signed URLs) |
| Auth | Auth.js |
| Rich text editor | Tiptap (blog) |
| Calendar UI | FullCalendar |
| Notifications | Homegrown (`Notification`/`NotificationPreference` tables, in-app feed + preference API, digest batching via BullMQ) + Resend (email) — no third-party notification vendor; Novu was evaluated and dropped since its main differentiator (built-in digest engine) isn't used, see §4.10 |
| Admin panel | AdminJS |
| Payments | Stripe (`/donate`, §4.14 — no relationship to `ContributionLedger` or `users.tier`; scoped to Phase 1, §10) |
| Deployment | Docker Compose initially → Kubernetes later |

Security requirements: RBAC, CSRF protection, rate limiting (Redis-backed), upload validation, audit logs, server-side auth checks on every protected route — enforced via Auth.js + Zod + Redis rate limiter.

---

## 9. Non-Functional Requirements

- **Responsive:** desktop-first design target, but mobile and tablet must be fully functional (mobile: stack cards, collapse tables to card-stacks, collapse sidebar to icon rail; tablet: compact sidebar, 2-column cards; desktop 1024px+: full layout).
- **Performance:** search must be near-instant (Meilisearch), dashboard/library/directory should support skeleton-loading states rather than blocking spinners.
- **Data integrity:** the Knowledge Hours ledger is the platform's trust mechanism — it must be append-only, fully auditable, and reconciliation-checkable at any time.
- **Privacy:** directory listing and specialty/location visibility must be per-user opt-in/opt-out and enforced server-side, not just hidden client-side.
- **Content moderation:** blog posts, library submissions, forum posts, and profile content need an admin moderation path (flag/remove) — for Forums this is a hard requirement (§4.13, "commercial promotion... needs actual moderation tooling"), not just implied. For Blog/Library it's implied by system-design.md's Admin Domain "content moderation" feature. This should extend to uploaded profile photos (flaggable/removable by an admin) since it's user-uploaded media.
- **Internationalization of time:** event times are currently displayed as raw UTC labels in the prototype; production must convert to viewer's local timezone.
- **Upload validation:** profile photo uploads (§4.3) must be server-side validated for file type (JPEG/PNG/WebP only), a maximum file size, and image dimensions before storage; reject anything else with a clear inline error per the Forms rules in §6.
- **Educational disclaimer:** the standard disclaimer (§4.15) must render on every public and member page footer, plus attach to Library case studies, Case Discussion events, and Clinical Discussions forum posts — this is a legal/compliance requirement, not a stylistic one, and should not be optional per-page.

---

## 10. Phased Delivery Plan

The original system-design.md phase structure grouped work by technical layer (auth → applications/ledger → events → inbox → content → admin) but didn't hold up under two checks: (1) does each phase produce something a stakeholder can actually see working end-to-end, and (2) does each phase's output unblock the next one, rather than assuming data that doesn't exist yet. Concretely, the original Phase 1 included a dashboard showing Hours balance and member data, but the ledger (Phase 2) and the admin approval flow that creates real member accounts (also Phase 2) didn't exist yet — Phase 1 wasn't actually demonstrable on its own. The plan also never scheduled five full feature domains (Member Directory, Our Team, Discussion Forums, Donations, Trust & Safety/Compliance), left Inbox (directory-originated only, per §4.7) scheduled before Directory existed, and pushed the disclaimer/Code of Conduct acceptance — called out elsewhere as hard pre-launch requirements — to the last phase, where they'd have to be retrofitted onto every earlier screen instead of built in once.

The plan below regroups work so each phase ships a coherent, demonstrable slice and unblocks the next by construction. Stack rows list only what's **newly introduced** in that phase; the foundational layer (Next.js 14/TypeScript/Tailwind/shadcn/ui, Prisma/PostgreSQL, Redis, Docker Compose, RBAC/CSRF/rate-limiting middleware) is established in Phase 1 and carries through every later phase without being repeated.

| Phase | Scope | Demonstrable outcome | New in tech stack | Prototype coverage |
|---|---|---|---|---|
| **1** | Real auth (login only); Application form → admin review queue → approve/reject with tier assignment (creates the real `User`); Our Team page (public, admin CRUD); Donations (`/donate` + `/admin/donations`, no relationship to ledger/tier per §4.14); site-wide educational disclaimer + Code of Conduct acceptance checkbox at application submission; **Dashboard shell** (zero-state widgets) and **Settings shell** (password change only) | A visitor applies, an admin approves and assigns a tier, the approved applicant logs in with real credentials and lands on a working (if mostly empty) Dashboard — and a visitor can already donate. This is the front door — every later phase needs real member accounts, and this is the only phase that creates them. Donations rides along since it's a standalone public page with no dependency on (or dependents in) any other domain, so pulling it forward costs nothing structurally. | Foundational layer (Next.js/TS/Tailwind/shadcn, Prisma/PostgreSQL, Redis, Docker Compose); Auth.js; React Hook Form + Zod; AdminJS (application review queue, Team CRUD); MinIO (`avatars/` bucket, for Our Team photos); Resend (application-confirmation + approval/welcome email); **Stripe** (`/donate`) | Application form UI exists; admin review UI, Our Team page, Donations page, and disclaimer/CoC acceptance are all net-new |
| **2** | Profile (edit, avatar upload, directory visibility prefs); Member Directory (search, tier filter, respects visibility) | Members can find and present themselves to each other in the Directory — the entry point every Inbox interaction in Phase 3 originates from. | Meilisearch (first search index — profiles); BullMQ (DB-write → queue → search-index-sync worker, per §7.2); TanStack Query + Zustand (directory list/filter state) | Directory UI exists in prototype; avatar-upload and directory-preference logic are net-new |
| **3** | Contribution Ledger (log-contribution, peer/admin confirmation, auto-post rules); Inbox (send message / request meeting from Directory cards, accept/decline/reschedule) | The core knowledge-exchange loop: a member finds another in the Directory, requests a consultation, it's accepted, hours move on the ledger. **Dashboard's Hours-balance widget goes live.** | Homegrown Notification API (in-app feed for new Inbox items — no Socket.IO needed, per §8's explicit note that Inbox is request/response, not live chat) | Ledger UI/read-model and Directory "Connect" stub exist; ledger write workflows, Inbox list/detail UI, and meeting-accept→ledger linkage are all net-new |
| **4** | Events & Calendar (public listing, member calendar, RSVP, submit-event); Attendance recording → auto-earn ledger transaction on event host | Hosting an event now closes the earn side of the ledger loop opened in Phase 3 — end-to-end earn *and* spend both demonstrable together. **Dashboard's upcoming-events widget goes live.** | FullCalendar | Full public + member calendar UI exists; RSVP/submit-event and the attendance→ledger auto-earn trigger are net-new |
| **5** | Blog, Knowledge Library (with Steward review queue), Discussion Forums — grouped together since all three share a submit → review/moderate → publish → index pattern | Full content ecosystem: write a post, submit a library resource, post in a forum, find any of it via section-scoped search. **Dashboard's recently-added-library widget goes live.** | Tiptap (blog editor); PDF.js (library document preview); YouTube embed for recorded lectures (no video storage/player infra needed); MinIO `documents/`/`attachments/` buckets; Meilisearch indexes extended to posts, knowledge_items, forum content | Full UI exists for Blog and Library; write/submission flows are stubbed toasts. Forums have no prototype UI at all — net-new, built on the same submit/moderate pattern as Library |
| **6** | Notification digests + Board Announcements; Code of Conduct reporting/enforcement + Privacy data-request fulfillment; Admin Reports (KPI dashboard), content moderation, ledger auditing | Operational layer — depends on data produced by every prior phase (KPIs aggregate applications/events/ledger; digests summarize forums/library/events content). **Settings' remaining sections go live** (notification/digest preferences, data export/deletion request), completing both Dashboard and Settings. | BullMQ scheduled job for periodic digest batching | Not represented in prototype at all — net-new throughout, design guided by ui-system.md's Admin Layout rules |

**A note on Dashboard and Settings:** neither belongs to a single phase — both are composite pages (§5) assembled from widgets/sections owned by other domains: Dashboard's stats row draws from the Ledger (Phase 3), Calendar (Phase 4), and Library (Phase 5); Settings draws from Auth (password change, Phase 1) and Notifications/Privacy (Phase 6). Both get a working shell in Phase 1 and fill in as their dependent phases land, finishing in Phase 6. One content fix along the way: the prototype's Dashboard stat "members online" implies live presence, which the stack deliberately has no infrastructure for (§8 — no Socket.IO); it should read as a static total-member count instead, which Phase 1 can already show.

**Why this ordering, not the original:** Phase 1 is now genuinely self-contained (it's also the actual bottleneck the original plan's closing note flagged but didn't act on — real member accounts can't exist before the approval workflow does). Directory now lands before Inbox, matching Inbox's hard dependency on directory-originated actions (§4.7). The disclaimer and Code of Conduct acceptance land where they're structurally cheapest — inside the application flow being built anyway in Phase 1 — rather than retrofitted onto five phases' worth of already-shipped screens in Phase 6. Donations moved into Phase 1 as well: it's a leaf feature (no dependency on member accounts, ledger, or any other domain, and §4.14 requires it stay structurally disconnected from `ContributionLedger`/`tier`), so shipping it early costs nothing and gets fundraising live sooner — the only tradeoff is introducing the Stripe dependency in Phase 1 rather than later. Trust & Safety's *enforcement/reporting* tooling (violation tracking, privacy fulfillment) stays in Phase 6 since it's genuinely operational and has no dependents.

---

## 11. Open Questions / Risks

1. **Admin review states:** should there be an explicit `needs_more_info` state between `under_review` and `approved/rejected`? The current three-state workflow may be too coarse for real review conversations.
2. **Event creation permission:** which tiers can submit events — Active only, or Active + Associate? Not specified in source docs.
3. **Inbox access by tier:** should Friend-tier members be reachable via the Directory's Send Message / Request Meeting actions? Assumed no, since Friend tier isn't listed in the Directory at all (§4.5) — needs confirmation (see also §4.7).
4. **Re-application policy:** can a rejected applicant reapply, and after what cooldown?
5. **Tier promotion:** system implies Associate → Active progression ("growing toward Active status") but no promotion trigger/workflow is specified — manual admin action, automatic threshold on lifetime hours, or hybrid?
6. ~~**Route naming:** `/join` (system-design.md) vs. `/apply` (prototype JS) — pick one before scaffolding.~~ **Resolved:** `/join` — already adopted in §5's IA table, matching system-design.md and the "Join NASIHA" CTA copy used everywhere; `/apply` was only ever the prototype's internal JS route name.
7. ~~**`/settings` page:** referenced in system-design.md's authenticated routes but has no corresponding UI in the prototype — scope needed.~~ **Resolved:** scoped in §5 as notification/digest preferences, password change, and the data export/deletion request flow (§4.15).
8. ~~**Video preview in Library:** system-design.md specifies PDF.js for document preview but is silent on video playback — needs a decision.~~ **Resolved:** recorded lectures are hosted on Nasiha's own YouTube channel and embedded via YouTube's player (§4.9) — no MinIO video storage or custom player needed.
9. **Our Team content gap:** the page's structure and admin CRUD are specified (§4.12), but real content for the **Partner** role is not — no partner names, titles, bios, or photos exist anywhere in the prototype or source docs. Founder/Board Member content exists from the previously-removed homepage section (git `151a8b2`: Dr. Uzma Khan, Nadeem Haider, Nighat Abidi) and can seed those three records, but Partners must be supplied by the org before this page can launch with real content.
10. **Moderator role scoping:** Library Stewards are described as "ideally one per specialty area at scale" (§4.9), but the data model has a single flat `moderator` role with no specialty/domain scoping — a Steward assigned informally to Cardiology could just as easily review or publish a Law submission. Needs a decision: acceptable v1 limitation (any moderator can act on any domain), or does the role need a `scope` field before launch?

---

## 12. Acceptance Criteria Summary (v1 / MVP definition)

MVP is considered feature-complete when:

- [ ] A visitor can browse Home/About/Our Team/How-to-Join/Events/Blog/Contact without an account.
- [ ] The Our Team page shows a combined grid of Founders, Board Members, and Partners (each with a role badge, photo or fallback avatar, and bio), sourced from admin-managed records rather than hardcoded content; an admin can add/edit/remove/reorder team members from `/admin/team`.
- [ ] A visitor can submit a membership application; an admin can review, approve (assigning a tier), or reject it with notes, from a real `/admin/applications` UI.
- [ ] An approved applicant receives credentials/invite and can log in via real auth (no demo-login shortcuts in production).
- [ ] A logged-in member sees a Dashboard (Hours-balance stats row, upcoming-events widget, recently-added-library widget, total-member count — not a live "members online" presence indicator) and can reach Settings (notification/digest preferences, password change, data export/deletion request); both exist from Phase 1 onward and are fully populated by Phase 6 (§10).
- [ ] A member can view/edit their profile, including directory visibility preferences and profile photo upload (with graceful fallback to the initials avatar when no photo is set).
- [ ] A member can view their Knowledge Hours balance (confirmed transactions only) and full transaction history including pending/rejected items; hosting an attended event and an accepted meeting request both auto-post to the ledger; other activities post as `pending` via "Log Contribution" and require counterpart or admin confirmation before counting toward the balance (§4.4).
- [ ] The Member Directory is searchable/filterable, respects each member's visibility preferences, and shows each member's uploaded photo (or initials fallback) as a thumbnail next to their name.
- [ ] A member can find another member in the Directory and send them a message or request a meeting; the recipient sees it in their Inbox and can respond (including accept/decline/reschedule for meeting requests).
- [ ] The Calendar shows real events; a member can RSVP and the event's attendee state updates.
- [ ] A member can write and publish a blog post; other members can read it publicly at `/blog/[slug]`.
- [ ] A member can submit a resource to the Knowledge Library with metadata and a file upload (MinIO-backed); it enters `pending_review` and only appears in search/browse after a Library Steward publishes it from `/admin/library/review-queue`.
- [ ] A member can browse and post in Discussion Forums (all six seeded categories); posts are visible to the full membership, and a member can follow a forum to receive digest updates instead of per-post notifications.
- [ ] A visitor or member can make a donation from `/donate`; the donation record has no relationship to Knowledge Hours balance or membership tier anywhere in the system.
- [ ] The Code of Conduct disclaimer and acceptance checkbox appear at application/first-login; a member can report a Code of Conduct concern; an admin can log a warning or suspension from `/admin/conduct`, and a suspended user cannot log in while their historical content/ledger entries remain intact.
- [ ] The standard educational disclaimer renders on every public/member page footer and on Library case studies, Case Discussion events, and Clinical Discussions forum posts.
- [ ] Case Discussion events and Library case-study submissions cannot be published without an explicit de-identification confirmation checkbox.
- [ ] A visitor can read the Privacy Policy at `/privacy`; a member can submit a data export or deletion request from `/settings`, and an admin can fulfill it from `/admin/privacy-requests`.
- [ ] Publishing a blog post or library item requires an explicit content-licensing consent step.
- [ ] An RSVP'd member sees the event's meeting/video link; it is not shown on the public `/events` listing.
- [ ] The application form collects a professional reference field; it becomes required (not just collected) once the admission phase config (§3.2) is set to Open Applications.
- [ ] Members inactive past the admin-configured threshold receive a friendly re-engagement nudge automatically; inactivity alone never suspends, downgrades, or removes a member.
- [ ] `/admin/reports` shows the four KPI groups (Community Health, Knowledge Exchange Activity, Impact, Organizational Health) computed from live platform data.
- [ ] A member can set their digest frequency from `/settings` and receives a batched digest instead of per-item notifications; an admin/board-role user can send a Board Announcement that every member receives regardless of notification preferences.
- [ ] All member and admin routes enforce server-side auth + RBAC.
- [ ] All pages implement loading/empty/error states per ui-system.md.
- [ ] Mobile breakpoints match the responsive rules in ui-system.md (§6 above).
