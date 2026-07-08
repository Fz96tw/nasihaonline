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

---

## 2. Users & Roles

### 2.1 System Roles (authz layer, from system-design.md)

```
guest       — unauthenticated visitor
applicant   — has submitted a membership application, pending review
member      — approved, authenticated user (see membership tiers, §3.2)
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

**Transaction types:** `earned`, `spent`, `transferred`, `adjusted` (adjusted = admin correction, must require admin role + reason note for audit).

**UI requirements (member-facing `/contributions`):**
- Summary bar: current balance, lifetime earned, lifetime spent, "Log Contribution" primary action.
- Full transaction history table: date, activity description, counterpart (person, if applicable), hours (signed, color-coded positive/negative).
- Nav badge showing live balance ("✦ N Knowledge Hours") next to the user's identity, always visible when authenticated.

Entities: `ContributionLedger`, `ContributionEvent`, `ContributionRule`.
Routes: `POST /api/contributions/earn`, `POST /api/contributions/spend`, `GET /api/contributions/history`.

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
- Event metadata: title, type (Webinar / Workshop / Case Discussion / Student Event / Roundtable / Lecture, extensible enum), host, date/time (must store as UTC + display with locale/timezone conversion — prototype hardcodes "UTC" labels, real system needs proper timezone handling), open/members-only flag, icon/category.
- Event submission by members ("Submit Event" action — implies an event-creation permission, likely gated to Active tier or above — **needs explicit rule**, see §11).
- Entities: `Event`, `EventRecurrence`, `RSVP`, `Attendance`.
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
- Comments supported per data model (not shown in prototype UI but required per system-design.md).
- Entities: `Post`, `PostCategory`, `PostTag`, `PostComment`.
- Routes: `/blog`, `/blog/[slug]` (public-readable; write requires member auth).

### 4.9 Knowledge Library

- Searchable, filterable resource repository: recorded lectures, articles/summaries, case studies, guidelines.
- Filters: content type, specialty, career-stage level (Student-Friendly / Early Career / Advanced / All Levels).
- Card metadata: contributor, category/specialty, file type icon, upload date, description.
- "Submit Resource" action for members.
- Preview: PDF.js for document types (per system-design.md); video type needs a player (not specified in system-design.md — recommend a standard HTML5/embedded player, e.g. via signed MinIO URL).
- Entities: `KnowledgeItem`, `KnowledgeCategory`, `KnowledgeTag`, `KnowledgeAttachment`.
- Storage: MinIO (binaries) + PostgreSQL (metadata) + Meilisearch (search index).
- Route: `/library`.

### 4.10 Notifications

Not visible in the HTML prototype's UI chrome but required per system-design.md; toasts in the prototype (e.g., "Registered for event!") are a proxy for what should become real, persistent, multi-channel notifications.

- Types: new message, event reminder, membership update (application approved/rejected), blog comment, contribution awarded.
- Channels: in-app + email (Novu + Resend per stack).
- Entities: `Notification`, `NotificationPreference` (must allow per-type opt-out).

### 4.11 Admin

Not present in the HTML prototype (no `/admin` UI was built), but required per system-design.md for the platform to be operable:

- User management, content moderation, event management, contribution ledger auditing (including manual `adjusted` transactions), application review queue.
- Tool: AdminJS.
- Routes: `/admin`, `/admin/users`, `/admin/applications`, `/admin/content`, `/admin/events`, `/admin/ledger`.
- Admin nav items (per ui-system.md): Users, Applications, Content, Events, Ledger, Reports.
- **This is a build gap vs. the prototype and should be treated as P0/critical-path** — approvals, tier assignment, and ledger adjustments are impossible without it.

---

## 5. Information Architecture / Routing

### Public
```
/                    Home (hero, how-it-works, knowledge exchange explainer, tiers, CTA)
/about               Mission, values, vision, dedication, "what we do"
/how-to-join         Admission phases, tier explainer, eligibility, CTA
/events              Public event list (RSVP requires membership)
/blog
/blog/[slug]
/join (apply)        Membership application form
/login
/forgot-password
/contact             Contact form
```

### Authenticated (Member)
```
/dashboard           Stats row (hours balance, lifetime earned, sessions contributed, members online),
                     upcoming events widget, recently-added library widget
/profile             Personal + professional info, directory preferences
/contributions       Knowledge Hours balance, lifetime stats, transaction history, log-contribution action
/members             Directory: search + tier filter; each member card links out to message/request-meeting
/inbox               Inbox list (messages + meeting requests, sent & received) / item detail pane
/calendar            Month grid + upcoming events list, submit-event action
/library             Search + filters (type, specialty, level), resource cards
/blog (write access) Same routes as public, plus authoring
/settings            (implied by system-design.md; not detailed in prototype — needs scoping)
```

### Admin
```
/admin
/admin/users
/admin/applications
/admin/content
/admin/events
/admin/ledger
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

**Accessibility:** keyboard navigation, visible focus states, ARIA labels, semantic HTML, AA color contrast — required on all buttons, modals, forms, nav menus.

**Theme preservation directive (explicit in ui-system.md):** do not redesign from scratch, do not change information hierarchy, do not over-simplify layouts — the prototype's card hierarchy, spacing, section order, density, and "premium" feel are the target, just rebuilt as reusable, data-driven components.

---

## 7. Data Model (consolidated)

Core tables (system-design.md, confirmed against prototype's implied entities):

```
users, profiles, skills, profile_skills,
membership_applications, application_reviews,
contribution_ledger,
events, rsvps, attendance,
inbox_messages, meeting_requests,
posts, post_categories, post_tags,
knowledge_items, knowledge_categories,
notifications
```

### 7.1 Notes from prototype reconciliation

- `users.tier` (active/associate/student/friend) is a first-class field distinct from `users.role` (guest/applicant/member/moderator/admin) — both are needed.
- `contribution_ledger` balance must be derivable via `SUM(transactions WHERE user_id = ?)`; do not store balance as the sole source of truth.
- Directory visibility requires two booleans on `profiles` (or a JSON prefs blob): `list_in_directory`, `show_specialty_location`.
- Event `open` boolean (public/free vs. members-only) is required on `events`.
- `profiles` needs an `avatar_url` field (nullable) pointing to the MinIO-stored profile photo; absence of a value is the signal to render the initials fallback (§4.3) — this is a display rule, not a separate "has photo" flag.
- `conversations`/`messages` (system-design.md's realtime DM tables) are **replaced** by `inbox_messages` + `meeting_requests` (§4.7) — no participant/conversation join table is needed since every thread is two-party and always originates from the Directory.

### 7.2 Search indexes (Meilisearch)

Indexed domains: `profiles`, `posts`, `knowledge_items`, `events`. Sync strategy: DB write → queue event (BullMQ) → worker updates index.

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
| Notifications | Novu (in-app) + Resend (email) |
| Admin panel | AdminJS |
| Deployment | Docker Compose initially → Kubernetes later |

Security requirements: RBAC, CSRF protection, rate limiting (Redis-backed), upload validation, audit logs, server-side auth checks on every protected route — enforced via Auth.js + Zod + Redis rate limiter.

---

## 9. Non-Functional Requirements

- **Responsive:** desktop-first design target, but mobile and tablet must be fully functional (mobile: stack cards, collapse tables to card-stacks, collapse sidebar to icon rail; tablet: compact sidebar, 2-column cards; desktop 1024px+: full layout).
- **Performance:** search must be near-instant (Meilisearch), dashboard/library/directory should support skeleton-loading states rather than blocking spinners.
- **Data integrity:** the Knowledge Hours ledger is the platform's trust mechanism — it must be append-only, fully auditable, and reconciliation-checkable at any time.
- **Privacy:** directory listing and specialty/location visibility must be per-user opt-in/opt-out and enforced server-side, not just hidden client-side.
- **Content moderation:** blog posts, library submissions, and profile content need an admin moderation path (flag/remove), even though no explicit UI exists in the prototype — implied by system-design.md's Admin Domain "content moderation" feature. This should extend to uploaded profile photos (flaggable/removable by an admin) since it's user-uploaded media.
- **Internationalization of time:** event times are currently displayed as raw UTC labels in the prototype; production must convert to viewer's local timezone.
- **Upload validation:** profile photo uploads (§4.3) must be server-side validated for file type (JPEG/PNG/WebP only), a maximum file size, and image dimensions before storage; reject anything else with a clear inline error per the Forms rules in §6.

---

## 10. Phased Delivery Plan

Adopting system-design.md's phase structure, annotated with prototype coverage to clarify what's a rebuild vs. net-new:

| Phase | Scope | Prototype coverage |
|---|---|---|
| **1** | Auth, users, profiles, dashboard | Prototype has full UI/UX for profile + dashboard (demo-auth only — real auth is net-new) |
| **2** | Applications, admin workflows, contribution ledger | Application form UI exists; **admin review UI does not exist** (net-new, critical path); ledger UI/read-model exists, write workflows (log contribution, admin adjust) are stubbed toasts only |
| **3** | Events, calendar, RSVPs | Full UI exists (public + member calendar); RSVP/submit-event currently stubbed, needs real backend |
| **4** | Inbox (messages + meeting requests), notifications | Directory has stub actions ("Connect" toast) that map to the Inbox's send-message/request-meeting entry points, but no Inbox list/detail UI exists yet; notifications have no dedicated UI at all — both are largely net-new |
| **5** | Blogs, knowledge library, search | Full UI exists for both; write flows (editor, resource submission) are stubbed toasts, need real implementation incl. Tiptap + MinIO upload |
| **6** | Moderation, analytics, auditing | Not represented in prototype at all — net-new, design from scratch guided by ui-system.md's Admin Layout rules |

**Recommendation:** Phase 2's admin application-review + tier-assignment workflow should be pulled forward if possible, since every later phase assumes members already exist with correct tiers — it is the actual bottleneck to a usable v1, not a phase-2-priority nice-to-have.

---

## 11. Open Questions / Risks

1. **Admin review states:** should there be an explicit `needs_more_info` state between `under_review` and `approved/rejected`? The current three-state workflow may be too coarse for real review conversations.
2. **Event creation permission:** which tiers can submit events — Active only, or Active + Associate? Not specified in source docs.
3. **Inbox access by tier:** should Friend-tier members be reachable via the Directory's Send Message / Request Meeting actions? Assumed no, since Friend tier isn't listed in the Directory at all (§4.5) — needs confirmation (see also §4.7).
4. **Re-application policy:** can a rejected applicant reapply, and after what cooldown?
5. **Tier promotion:** system implies Associate → Active progression ("growing toward Active status") but no promotion trigger/workflow is specified — manual admin action, automatic threshold on lifetime hours, or hybrid?
6. **Route naming:** `/join` (system-design.md) vs. `/apply` (prototype JS) — pick one before scaffolding.
7. **`/settings` page:** referenced in system-design.md's authenticated routes but has no corresponding UI in the prototype — scope needed (notification prefs, password change, account deletion?).
8. **Video preview in Library:** system-design.md specifies PDF.js for document preview but is silent on video playback — needs a decision (embedded player + MinIO signed URL is the natural fit given the existing stack).

---

## 12. Acceptance Criteria Summary (v1 / MVP definition)

MVP is considered feature-complete when:

- [ ] A visitor can browse Home/About/How-to-Join/Events/Blog/Contact without an account.
- [ ] A visitor can submit a membership application; an admin can review, approve (assigning a tier), or reject it with notes, from a real `/admin/applications` UI.
- [ ] An approved applicant receives credentials/invite and can log in via real auth (no demo-login shortcuts in production).
- [ ] A member can view/edit their profile, including directory visibility preferences and profile photo upload (with graceful fallback to the initials avatar when no photo is set).
- [ ] A member can view their Knowledge Hours balance and full transaction history; a real "log contribution" flow writes an immutable ledger entry (self-reported initially, or admin-confirmed — decide per §11).
- [ ] The Member Directory is searchable/filterable, respects each member's visibility preferences, and shows each member's uploaded photo (or initials fallback) as a thumbnail next to their name.
- [ ] A member can find another member in the Directory and send them a message or request a meeting; the recipient sees it in their Inbox and can respond (including accept/decline/reschedule for meeting requests).
- [ ] The Calendar shows real events; a member can RSVP and the event's attendee state updates.
- [ ] A member can write and publish a blog post; other members can read it publicly at `/blog/[slug]`.
- [ ] A member can submit a resource to the Knowledge Library with metadata and a file upload (MinIO-backed), and it becomes searchable/filterable.
- [ ] All member and admin routes enforce server-side auth + RBAC.
- [ ] All pages implement loading/empty/error states per ui-system.md.
- [ ] Mobile breakpoints match the responsive rules in ui-system.md (§6 above).
