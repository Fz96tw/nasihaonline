# LinkedIn Post — Delivering NASIHA with Planwright

**A non-profit asked me to build their whole member platform. 12 weeks later it was live in production, and AI agents had written most of the code.**

Earlier this year NASIHA, a non-profit building a global community for mentorship and knowledge-sharing, asked me to design and deliver their platform. I said yes right away. I believed in the cause, and I was confident I could get v1 live within a couple of months by running delivery with AI agents through Planwright.

Here's how it worked:

📄 **Spec first.** An AI-assisted PRD covering 17 feature areas. v1 shipped with:
- Invite-only membership: application, admin review, onboarding
- Searchable member directory and private messaging
- Events, RSVPs, and built-in video conferencing with recording
- Knowledge Hours: a time-bank ledger that rewards members for helping each other
- Knowledge library, blog, and discussion forums, with moderation
- Peer review for members' work
- Site-wide search, admin dashboards, and an audit log

🧩 **Decompose before coding.** Planwright broke the PRD into 6 delivery phases and then into small objectives. Each objective had about 6 testable acceptance criteria before any agent wrote code.

🤖 **Agents build, a human decides.** Coding agents claimed objectives, posted a plan, and passed an alignment check against the spec. Every objective came back to me for review before it was accepted.

**By the numbers:**
- 12 weeks from first commit to production
- ~300 objectives built by agents and accepted by a human
- Median agent build time under 10 minutes per objective
- 94% delivered on time against the project's own baseline
- 6 PRD phases plus 13 more feature releases shipped
- ~98K lines of TypeScript, 94 pages, 75 data models

**Where it got hard:** The agents never made the big decisions. Google Meet couldn't record for regular member accounts, so we built our own conferencing on self-hosted LiveKit. We also moved production to a new server partway through. AI took care of the volume of work. My job was the judgment calls.

The platform keeps growing, with new features shipping every week.

"[Quote from NASIHA leadership]"

If you have a product that needs to get into production and not just to a demo, message me. 👉 [your site / Planwright link]

#AIassistedSDLC #AgenticAI #SoftwareDelivery #NonProfitTech

---

## Notes (not for posting)

Metric sources, pulled 2026-10-14:

| Claim | Source |
|---|---|
| 12 weeks | First commit 2026-06-12 → VPS production cutover 2026-09-05 |
| ~300 objectives | Planwright ETA baseline: 297 completed objectives in this project |
| ~6 acceptance criteria each | Median 6 (mean 6.3) across the 89 objectives readable via MCP; 560 criteria in total |
| <10 min median build | Agent claim → hand-off for review: 6.6 min median, 14 min p75 (same 89). All-time scheduled → accepted average is ~6h |
| 94% on time | 83 of 88 "On time" in Planwright's actual-vs-baseline verdict (same 89) |
| 6 phases + 13 releases | Initiatives marked released on the board |
| 98K LOC / 94 pages / 75 models | Tracked `.ts`/`.tsx` excluding generated code, `page.tsx` count, `schema.prisma` models |

Before posting:
- **Get NASIHA's consent and a quote.**
- **Add an image:** a board screenshot or a metrics card. Board: https://planwright.tools/app/cloudcurio/6b2046b5-5198-4802-a53c-484d80b80c33. If you screenshot it, move the objectives waiting in the Acceptance lane to Done first.
- **List only released features.** Circles, the directory map, recordings published to the library, and quick video sharing are not released yet.
