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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
