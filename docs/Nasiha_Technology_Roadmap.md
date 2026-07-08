# Nasiha — Technology Roadmap
*Draft — May 2026*

---

## Philosophy

Technology should serve the community, not define it. Nasiha does not need to build custom software from day one — it needs to choose the right tools at the right time, starting simple and adding complexity only when the community has grown to the point where simpler tools break down.

The roadmap is organized into three phases, mirroring the membership growth strategy.

---

## Phase 1 — Founding Cohort: Keep It Simple (0–50 Members)

At this stage, the priority is getting the community active, not building infrastructure. Use existing tools that require minimal setup and cost.

### Website
A simple public-facing site explaining what Nasiha is, how it works, and how to apply for membership.

- **What it needs:** Mission statement, how-to-join, FAQ, contact form, medical disclaimer
- **Recommended approach:** A no-code tool (e.g., Notion public page, Squarespace, or Webflow) — fast to launch, easy to update
- **Domain:** Secure a nasiha.org (or equivalent) domain early

### Communication & Community
- **WhatsApp or email group** for the founding cohort — low friction, familiar to medical professionals globally
- As the group grows beyond ~20 people, consider moving to a structured platform (see Phase 2)

### Digital Ledger (Credits)
- **Google Sheets or Airtable** — a simple shared spreadsheet tracking member credits, with columns for: Member Name, Activity, Date, Credits Earned/Spent, Counterpart, Running Balance, Lifetime Total
- Access controlled by the Treasurer or designated Credit Administrator
- Members can request their statement at any time

### Member Directory
- A simple shared document or Airtable base listing members, their specialty, location, and areas of expertise
- Visible only to members, not publicly

### Video Sessions
- **Zoom or Google Meet** for lectures, webinars, and mentorship sessions — free tiers sufficient at this scale

### Cost estimate (Phase 1): ~$100–300/year (domain + basic website hosting)

---

## Phase 2 — Referral Growth: Add Structure (50–300 Members)

As membership grows, informal tools start to break down. This phase introduces a proper community platform and more robust credit tracking.

### Community Platform
Move from WhatsApp/email to a dedicated community platform that supports:
- Topic-based discussion forums
- Member profiles and directory
- Platform inbox/relay for member-to-member messaging
- Announcements and digest distribution
- Event listings

**Platforms to evaluate:**

| Platform | Strengths | Considerations |
|---|---|---|
| Slack | Familiar, good for async discussion | Not ideal for large communities, lacks member directory |
| Discord | Free, channels work well | Less professional feel for medical audience |
| Circle | Purpose-built community platform, clean UX | Paid, ~$99/month |
| Mighty Networks | Strong community features, member profiles | Paid, ~$33–99/month |
| Discourse | Open-source forums, highly customizable | Requires hosting and setup effort |

**Recommendation:** Evaluate Circle or Mighty Networks for Phase 2 — purpose-built for communities, include member profiles, and avoid the clutter of Slack/Discord. Self-host Discourse if cost is a constraint.

### Digital Ledger Upgrade
- Move from Google Sheets to **Airtable** (if not already) or a lightweight database (e.g., Notion database, or a simple web app)
- Automate credit recording where possible — e.g., a form members submit after a session that logs the transaction for administrator review
- Members can view their own balance via a filtered view or member portal

### Video Sessions
- Continue with Zoom or Google Meet; consider Zoom Webinar for larger events with audience Q&A

### Website Upgrade
- Add a member login area (even if basic) for accessing the directory and submitting credit transactions
- Add a public events calendar
- Add a donation page linked to the Organization's bank account

### Cost estimate (Phase 2): ~$1,500–3,000/year (community platform + upgraded tools)

---

## Phase 3 — Open Applications: Integrated Platform (300+ Members)

At scale, Nasiha needs integrated technology — a single system where membership, credits, communications, and the knowledge library work together.

### Options

**Option A — Assemble best-of-breed tools**
Continue using specialized tools for each function (community platform, credit ledger, video, website) but integrate them via automation tools like Zapier or Make. Lower upfront cost but more administrative overhead.

**Option B — Custom-built platform**
Build a purpose-designed Nasiha platform that integrates all functions: member profiles, credit ledger, messaging relay, forums, event hosting, and knowledge library. Higher cost and effort but fully mission-aligned and scalable. Nadeem Haider's technology background makes this a realistic long-term path.

**Option C — Adapt an existing time banking platform**
Platforms like hOurworld already support time credit systems and community exchange. Adapting one of these could accelerate development while staying true to the time-banking model Nasiha resembles.

**Recommendation:** Pursue Option A in early Phase 3 while evaluating Option B as a 2–3 year horizon goal. Option C is worth investigating before committing to a custom build.

### Key Features Needed at Phase 3
- Member self-service: view profile, update preferences, check credit balance, submit transactions
- Automated credit ledger with member-facing dashboard
- Integrated messaging relay (no direct contact without consent)
- Searchable knowledge library (see Content & Knowledge Library document)
- Event registration and recording archive
- Admin dashboard for the Board: membership stats, credit exchange metrics, KPI tracking

### Cost estimate (Phase 3): $5,000–20,000+/year depending on build vs. buy approach

---

## Technology Principles

Regardless of phase, Nasiha's technology choices should follow these principles:

- **Privacy first.** Member data is protected, access-controlled, and never shared without consent.
- **Accessible globally.** Tools must work reliably across geographies, including regions with slower internet. Avoid platforms that are blocked in key countries.
- **Low friction for members.** If a tool is hard to use, members won't use it. Simplicity beats features.
- **Avoid vendor lock-in.** Where possible, prefer tools that allow data export — so Nasiha is never trapped by a platform.
- **Start free, pay when it matters.** Use free tiers until the community genuinely needs more.

---

## Immediate Actions

- [ ] Register domain (nasiha.org or equivalent)
- [ ] Launch simple website (Phase 1)
- [ ] Set up Google Sheets credit ledger
- [ ] Set up member directory (Airtable or shared doc)
- [ ] Establish a Zoom account for community sessions
- [ ] Evaluate Circle and Mighty Networks for Phase 2 readiness
