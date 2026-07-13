import { db } from "@/lib/db";

// Common expertise areas across Nasiha's membership (clinical, public
// health, research, and non-clinical board/leadership domains — matches
// the categories used in the prototype's directory/knowledge examples).
// This is the seed source of truth for taggable Skill.name values;
// members can only attach existing skills, not create new ones inline.
const SKILLS: string[] = [
  "Internal Medicine",
  "Cardiology",
  "Oncology",
  "Pediatrics",
  "Primary Care / Family Medicine",
  "Surgery",
  "Psychiatry / Mental Health",
  "Radiology",
  "Emergency Medicine",
  "Palliative Care",
  "Nursing",
  "Public Health",
  "Global Health",
  "Epidemiology",
  "Clinical Research",
  "Research Methodology",
  "Medical Education",
  "Healthcare Leadership",
  "Health Policy",
  "Health Technology",
  "Technology",
  "Business / Nonprofit Leadership",
  "Communication",
];

// Configurable earn/spend rate card (PRD §4.4's tables) — a managed
// table, not hardcoded, so the org can tune rates over time. "Attend
// webinar" is deliberately excluded: the PRD states it's always free,
// not a spend event, so it has no rule.
const CONTRIBUTION_RULES: {
  activityKey: string;
  label: string;
  type: "earned" | "spent";
  hours: number;
}[] = [
  { activityKey: "lecture_webinar", label: "Lecture / webinar delivered", type: "earned", hours: 1.0 },
  { activityKey: "knowledge_discussion", label: "Knowledge discussion", type: "earned", hours: 0.5 },
  { activityKey: "curate_resource", label: "Curate a resource", type: "earned", hours: 0.5 },
  // "variable (seen: 2.0)" per §4.4 — 2.0 is the default rate; an admin
  // can override the hours on an individual ledger entry when logging.
  { activityKey: "admin_volunteer_work", label: "Administrative volunteer work", type: "earned", hours: 2.0 },
  { activityKey: "expert_consultation", label: "Expert consultation", type: "spent", hours: 1.0 },
  {
    activityKey: "research_case_discussion",
    label: "Research resource / case discussion request",
    type: "spent",
    hours: 0.5,
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// One-time-per-row backfill: existing profiles stored expertise as free
// text before Skill/ProfileSkill existed (PRD §4.3/§7.3). Match entries
// case-insensitively against the seeded catalog, link the matches, and
// leave anything that doesn't match as free-text fallback on the profile.
async function backfillProfileSkills() {
  const skills = await db.skill.findMany();
  const skillByLowerName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]));

  const profiles = await db.profile.findMany({
    where: { expertiseAreas: { isEmpty: false } },
  });

  let linked = 0;
  for (const profile of profiles) {
    const remaining: string[] = [];
    for (const entry of profile.expertiseAreas) {
      const skill = skillByLowerName.get(entry.trim().toLowerCase());
      if (!skill) {
        remaining.push(entry);
        continue;
      }
      await db.profileSkill.upsert({
        where: { profileId_skillId: { profileId: profile.id, skillId: skill.id } },
        update: {},
        create: { profileId: profile.id, skillId: skill.id },
      });
      linked += 1;
    }
    if (remaining.length !== profile.expertiseAreas.length) {
      await db.profile.update({
        where: { id: profile.id },
        data: { expertiseAreas: remaining },
      });
    }
  }
  console.log(`Backfilled ${linked} profile-skill links across ${profiles.length} profile(s).`);
}

// Sample events for the calendar/RSVP UI (PRD §4.6's "so 4.2 onward have
// real data to render immediately"). Hosts are assigned round-robin from
// whatever real (Clerk-synced) members already exist — never fabricated
// User rows, since local Users only ever come from the Clerk webhook
// (web/README.md's auth setup). Dates are relative to seed time so the
// events always land in the "upcoming" window regardless of when this runs.
const SAMPLE_EVENTS: {
  title: string;
  description: string;
  type: "webinar" | "workshop" | "case_discussion" | "student_event" | "roundtable" | "lecture";
  open: boolean;
  icon: string;
  daysFromNow: number;
  hourUtc: number;
  durationMinutes: number;
  deidentificationConfirmed?: boolean;
}[] = [
  {
    title: "Cardiology Update 2026",
    description: "Latest ACC/AHA guidelines on heart failure management.",
    type: "webinar",
    open: true,
    icon: "🫀",
    daysFromNow: 3,
    hourUtc: 19,
    durationMinutes: 60,
  },
  {
    title: "Research Methodology for Clinicians",
    description: "A practical workshop on designing and running a clinical research study.",
    type: "workshop",
    open: false,
    icon: "🔬",
    daysFromNow: 8,
    hourUtc: 18,
    durationMinutes: 90,
  },
  {
    title: "Case Discussion: Complex Oncology",
    description: "De-identified case review and discussion among members.",
    type: "case_discussion",
    open: false,
    icon: "🏥",
    daysFromNow: 12,
    hourUtc: 20,
    durationMinutes: 60,
    deidentificationConfirmed: true,
  },
  {
    title: "Student Forum: Residency Applications",
    description: "Open Q&A on navigating the residency application process.",
    type: "student_event",
    open: true,
    icon: "🎓",
    daysFromNow: 17,
    hourUtc: 17,
    durationMinutes: 60,
  },
  {
    title: "Global Health Policy Roundtable",
    description: "Monthly member roundtable on global health policy topics.",
    type: "roundtable",
    open: false,
    icon: "🌍",
    daysFromNow: 22,
    hourUtc: 15,
    durationMinutes: 60,
  },
  {
    title: "ECG Masterclass",
    description: "A deep-dive lecture on ECG interpretation for clinicians.",
    type: "lecture",
    open: false,
    icon: "📈",
    daysFromNow: 26,
    hourUtc: 19,
    durationMinutes: 75,
  },
];

async function seedEvents() {
  const hosts = await db.user.findMany({
    where: { role: { in: ["member", "moderator", "admin"] } },
    orderBy: { createdAt: "asc" },
  });

  if (hosts.length === 0) {
    console.log("No members found yet — skipping event seed (run again once at least one member exists).");
    return;
  }

  const now = new Date();
  let created = 0;
  for (let i = 0; i < SAMPLE_EVENTS.length; i++) {
    const sample = SAMPLE_EVENTS[i];
    const existing = await db.event.findFirst({ where: { title: sample.title } });
    if (existing) continue;

    const startsAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + sample.daysFromNow,
        sample.hourUtc,
        0,
        0,
      ),
    );
    const endsAt = new Date(startsAt.getTime() + sample.durationMinutes * 60_000);

    const event = await db.event.create({
      data: {
        title: sample.title,
        description: sample.description,
        type: sample.type,
        hostId: hosts[i % hosts.length].id,
        startsAt,
        endsAt,
        open: sample.open,
        icon: sample.icon,
        meetingUrl: "https://meet.google.com/nasiha-sample-session",
        deidentificationConfirmed: sample.deidentificationConfirmed ?? false,
      },
    });

    // Demonstrate the recurrence relation on one sample (roundtables recur monthly).
    if (sample.type === "roundtable") {
      await db.eventRecurrence.create({
        data: { eventId: event.id, frequency: "monthly", interval: 1 },
      });
    }

    created += 1;
  }
  console.log(`Seeded ${created} sample event(s) (${SAMPLE_EVENTS.length - created} already present).`);
}

async function main() {
  for (const name of SKILLS) {
    await db.skill.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }
  console.log(`Seeded ${SKILLS.length} skills.`);

  await backfillProfileSkills();

  for (const rule of CONTRIBUTION_RULES) {
    await db.contributionRule.upsert({
      where: { activityKey: rule.activityKey },
      update: { label: rule.label, type: rule.type, hours: rule.hours },
      create: rule,
    });
  }
  console.log(`Seeded ${CONTRIBUTION_RULES.length} contribution rules.`);

  await seedEvents();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
