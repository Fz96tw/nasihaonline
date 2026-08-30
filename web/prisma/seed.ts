import { db } from "@/lib/db";
import { EVENTS_FORUM_SLUG } from "@/lib/forums";
import { INTEREST_AREA_LABELS } from "@/lib/interest-areas";

// Absolute, not relative — same rationale as events-server.ts's createEvent:
// lib/linkify.tsx's linkifyText only turns absolute http(s) URLs into links.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Demo/example content (sample events, knowledge items, forum threads) vs.
// the managed taxonomy (skills, contribution rules, categories, forum
// categories) that the app needs populated regardless of environment.
// Default on for local/dev convenience; set to "false" in prod so a fresh
// deployment doesn't launch with placeholder content in front of real members.
const SEED_SAMPLE_DATA = process.env.SEED_SAMPLE_DATA !== "false";

// Tagged expertise across Nasiha's membership (Profile.skillIds, §4.3/§7.3)
// — grouped here by the InterestArea domain (lib/interest-areas.ts) it's
// most associated with, so the list stays proportioned across the platform's
// broader (no longer medical-only) membership rather than skewing clinical.
// This is the seed source of truth for taggable Skill.name values; members
// can only attach existing skills, not create new ones inline.
const SKILLS: string[] = [
  // Arts & Crafts
  "Visual Arts",
  "Crafting & Handmade Goods",
  // Basic Science Research
  "Basic Science Research",
  "Epidemiology",
  // Biotechnology
  "Biotechnology",
  "Genomics",
  // Business
  "Business",
  "Entrepreneurship",
  "Nonprofit Management",
  // Clinical Research
  "Clinical Research",
  "Research Methodology",
  // Culinary Arts
  "Culinary Arts",
  // Data & Analytics
  "Data Analytics",
  "Data Science",
  // E-Learning
  "Instructional Design & E-Learning",
  // Education
  "Education",
  "Medical Education",
  // Finance & Investing
  "Finance & Investing",
  "Accounting",
  // Health & Wellness
  "Nutrition",
  "Wellness Coaching",
  // Health-tech
  "Health Technology",
  "Telemedicine",
  // Healthcare
  "Internal Medicine",
  "Cardiology",
  "Pediatrics",
  "Surgery",
  "Psychiatry / Mental Health",
  "Emergency Medicine",
  "Nursing",
  "Primary Care / Family Medicine",
  "Public Health",
  "Global Health",
  "Health Policy",
  // Leadership & Management
  "Leadership & Management",
  "Healthcare Leadership",
  "Communication",
  // Literature & Writing
  "Writing & Editing",
  "Literature",
  // Marketing & Sales
  "Marketing",
  "Sales",
  // Music
  "Music Performance",
  "Music Production",
  // Science
  "Science Communication",
  "Philosophy",
  // Sustainability & Environment
  "Sustainability",
  "Environmental Science",
  // Tech & Development
  "Technology",
  "Software Engineering",
  "Cybersecurity",
  // Travel & Culture
  "Travel & Cultural Exchange",
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
  { activityKey: "review_feedback", label: "Peer Review & Feedback given", type: "earned", hours: 0.5 },
  // write_post ("Write a blog post") is retired — Blog was consolidated
  // into the Library, so writing a post now earns via curate_resource like
  // any other submission. No longer seeded as active; the existing
  // production row was deactivated (active: false) directly, kept for
  // historical ledger rows rather than deleted.
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
    daysFromNow: 3,
    hourUtc: 19,
    durationMinutes: 60,
  },
  {
    title: "Research Methodology for Clinicians",
    description: "A practical workshop on designing and running a clinical research study.",
    type: "workshop",
    open: false,
    daysFromNow: 8,
    hourUtc: 18,
    durationMinutes: 90,
  },
  {
    title: "Case Discussion: Complex Oncology",
    description: "De-identified case review and discussion among members.",
    type: "case_discussion",
    open: false,
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
    daysFromNow: 17,
    hourUtc: 17,
    durationMinutes: 60,
  },
  {
    title: "Global Health Policy Roundtable",
    description: "Monthly member roundtable on global health policy topics.",
    type: "roundtable",
    open: false,
    daysFromNow: 22,
    hourUtc: 15,
    durationMinutes: 60,
  },
  {
    title: "ECG Masterclass",
    description: "A deep-dive lecture on ECG interpretation for clinicians.",
    type: "lecture",
    open: false,
    daysFromNow: 26,
    hourUtc: 19,
    durationMinutes: 75,
  },
];

async function seedEvents() {
  if (!SEED_SAMPLE_DATA) {
    console.log("SEED_SAMPLE_DATA=false — skipping sample events.");
    return;
  }

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

// Managed Library taxonomy (§4.9 — "should be a managed taxonomy, not
// hardcoded"). Mirrors the same broad InterestArea labels members pick from
// on the profile/join form (§3.3/§4.3) rather than a medical-specific list —
// the platform isn't medical-only, so Library categories (blog_post content
// type included) shouldn't be either.
const KNOWLEDGE_CATEGORIES = Object.values(INTEREST_AREA_LABELS);
const KNOWLEDGE_TAGS = ["guidelines", "review-article", "recorded-lecture", "case-study"];

// Community-based-categorization initiative: the 8 top-level communities
// every KnowledgeCategory belongs to.
const COMMUNITIES: { name: string; slug: string; description: string }[] = [
  {
    name: "Healthcare",
    slug: "healthcare",
    description: "Clinical practice, patient care, and medical knowledge across specialties.",
  },
  {
    name: "Sciences",
    slug: "sciences",
    description: "Research, experimentation, and discovery across the natural and physical sciences.",
  },
  {
    name: "Business & Finance",
    slug: "business-finance",
    description: "Entrepreneurship, investing, career growth, and financial literacy.",
  },
  {
    name: "Technology",
    slug: "technology",
    description: "Software, data, engineering, and the tools shaping how we build and work.",
  },
  {
    name: "Education & Career",
    slug: "education-career",
    description: "Teaching, learning, mentorship, and professional development at every stage.",
  },
  {
    name: "Humanities",
    slug: "humanities",
    description: "History, philosophy, language, and the ideas that shape how we understand each other.",
  },
  {
    name: "Arts, Culture & Lifestyle",
    slug: "arts-culture-lifestyle",
    description: "Creative work, cultural traditions, and everyday living well.",
  },
  {
    name: "Nature & Outdoor",
    slug: "nature-outdoor",
    description: "The natural world, conservation, and life outside — from hiking to gardening.",
  },
];

// Single source of truth for which Community each KnowledgeCategory belongs
// to — mirrored exactly in migration 20260829180000_expand_to_8_communities's
// SQL, so a fresh environment's seed and the production migration agree.
// Every INTEREST_AREA_LABELS value must appear here exactly once.
const CATEGORY_COMMUNITY_MAP: Record<string, string> = {
  Healthcare: "Healthcare",
  "Health & Wellness": "Healthcare",
  "Health-tech": "Healthcare",
  "Clinical Research": "Healthcare",
  "Health & Fitness": "Healthcare",
  "Basic Science Research": "Sciences",
  Biotechnology: "Sciences",
  Science: "Sciences",
  "Sustainability & Environment": "Sciences",
  Engineering: "Sciences",
  "Psychology & Sociology": "Sciences",
  Business: "Business & Finance",
  "Finance & Investing": "Business & Finance",
  "Marketing & Sales": "Business & Finance",
  "Leadership & Management": "Business & Finance",
  "Tech & Development": "Technology",
  "Data & Analytics": "Technology",
  "E-Learning": "Technology",
  Education: "Education & Career",
  "Career Development": "Education & Career",
  History: "Humanities",
  "Literature & Writing": "Humanities",
  Law: "Humanities",
  Philosophy: "Humanities",
  "Arts & Crafts": "Arts, Culture & Lifestyle",
  Music: "Arts, Culture & Lifestyle",
  "Culinary Arts": "Arts, Culture & Lifestyle",
  "Travel & Culture": "Arts, Culture & Lifestyle",
  DIY: "Arts, Culture & Lifestyle",
  "Home Improvement & Decor": "Arts, Culture & Lifestyle",
  Architecture: "Arts, Culture & Lifestyle",
  Photography: "Arts, Culture & Lifestyle",
  "Camping & Hiking": "Nature & Outdoor",
  Fishing: "Nature & Outdoor",
  "Nature & Wildlife": "Nature & Outdoor",
};

for (const name of KNOWLEDGE_CATEGORIES) {
  if (!CATEGORY_COMMUNITY_MAP[name]) {
    throw new Error(`CATEGORY_COMMUNITY_MAP is missing an entry for knowledge category "${name}".`);
  }
}

// Six member-browsable forum categories from Member_Communications.md's
// table, plus two on-demand forums (Events Discussion, Library Discussions)
// that don't appear in the /forums index — see getForumCategories in
// lib/forums-server.ts. A seventh category, "Peer Review & Feedback", used
// to live here (§4.13) but has been replaced by the dedicated
// /review-feedback feature (ReviewItem et al.) — the existing seeded Forum
// row is deactivated (active=false) rather than deleted, so any historical
// threads in it stay intact but the category no longer appears on /forums.
const FORUMS: { name: string; description: string; displayOrder: number }[] = [
  { name: "General", description: "Community announcements, introductions, open discussion.", displayOrder: 0 },
  {
    name: "Clinical Discussions",
    description: "Case-based learning, diagnostic questions, treatment approaches.",
    displayOrder: 1,
  },
  {
    name: "Research & Resources",
    description: "Sharing articles, tools, guidelines, curated learning materials.",
    displayOrder: 2,
  },
  {
    name: "Teaching & Mentorship",
    description: "Advice on teaching, mentorship requests, pedagogical discussion.",
    displayOrder: 3,
  },
  { name: "Students & Trainees", description: "Dedicated space for early-career members.", displayOrder: 4 },
  {
    name: "Organizational",
    description: "Board updates, policy discussions, credit system questions.",
    displayOrder: 5,
  },
  {
    name: "Events Discussion",
    description: "Auto-created discussion threads for events that opt in at submission time.",
    displayOrder: 6,
  },
  {
    name: "Library Discussions",
    description: "On-demand discussion threads for Knowledge Library resources, started from a resource's detail page.",
    displayOrder: 7,
  },
  {
    name: "Community Feedback",
    description: "Suggestions, feature requests, and feedback on the platform and community programs.",
    displayOrder: 8,
  },
];


// Sample Knowledge Library items covering the review workflow (§4.9): a
// published article with an attachment, a pending_review case study, and a
// published recorded lecture (youtubeUrl, no attachment).
const SAMPLE_KNOWLEDGE_ITEMS: {
  title: string;
  description: string;
  contentType: "recorded_lecture" | "article" | "case_study" | "guideline";
  status: "pending_review" | "published" | "flagged" | "rejected";
  level: "student_friendly" | "early_career" | "advanced" | "all_levels";
  categories: string[];
  youtubeUrl?: string;
  attachment?: boolean;
  deidentificationConfirmed?: boolean;
}[] = [
  {
    title: "Reviewing the 2026 Global Health Equity Report",
    description: "A summary article on this year's global health equity findings and their implications for practice.",
    contentType: "article",
    status: "published",
    level: "all_levels",
    // Demonstrates an item spanning more than one category (§4.9).
    categories: ["Healthcare", "Clinical Research"],
    attachment: true,
  },
  {
    title: "Case Study: Atypical Presentation in Pediatric Oncology",
    description: "A de-identified case study submitted for Steward review, covering an atypical diagnostic pathway.",
    contentType: "case_study",
    status: "pending_review",
    level: "advanced",
    categories: ["Healthcare"],
    deidentificationConfirmed: true,
  },
  {
    title: "Recorded Lecture: Foundations of Clinical Research Methodology",
    description: "An introductory recorded lecture on clinical research methodology for early-career members.",
    contentType: "recorded_lecture",
    status: "published",
    level: "early_career",
    categories: ["Clinical Research"],
    youtubeUrl: "https://www.youtube.com/watch?v=nasiha-sample-lecture",
  },
];

async function seedKnowledgeLibrary() {
  const communitiesByName = new Map<string, { id: string }>();
  for (const { name, slug, description } of COMMUNITIES) {
    const community = await db.community.upsert({
      where: { name },
      update: { description },
      create: { name, slug, description },
    });
    communitiesByName.set(name, community);
  }
  console.log(`Seeded ${COMMUNITIES.length} communities.`);

  const categoriesByName = new Map<string, { id: string }>();
  for (const name of KNOWLEDGE_CATEGORIES) {
    const communityId = communitiesByName.get(CATEGORY_COMMUNITY_MAP[name])!.id;
    const category = await db.knowledgeCategory.upsert({
      where: { name },
      update: { communityId },
      create: { name, slug: slugify(name), communityId },
    });
    categoriesByName.set(name, category);
  }
  console.log(`Seeded ${KNOWLEDGE_CATEGORIES.length} knowledge categories.`);

  const tagsByName = new Map<string, { id: string }>();
  for (const name of KNOWLEDGE_TAGS) {
    const tag = await db.knowledgeTag.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    tagsByName.set(name, tag);
  }
  console.log(`Seeded ${KNOWLEDGE_TAGS.length} knowledge tags.`);

  if (!SEED_SAMPLE_DATA) {
    console.log("SEED_SAMPLE_DATA=false — skipping sample knowledge items.");
    return;
  }

  const contributors = await db.user.findMany({
    where: { role: { in: ["member", "moderator", "admin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (contributors.length === 0) {
    console.log("No members found yet — skipping library seed (run again once at least one member exists).");
    return;
  }

  let created = 0;
  for (let i = 0; i < SAMPLE_KNOWLEDGE_ITEMS.length; i++) {
    const sample = SAMPLE_KNOWLEDGE_ITEMS[i];
    const existing = await db.knowledgeItem.findFirst({ where: { title: sample.title } });
    if (existing) continue;

    const categoryIds = sample.categories.map((name) => categoriesByName.get(name)!.id);
    await db.knowledgeItem.create({
      data: {
        title: sample.title,
        description: sample.description,
        contentType: sample.contentType,
        status: sample.status,
        level: sample.level,
        contributorId: contributors[i % contributors.length].id,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        youtubeUrl: sample.youtubeUrl,
        deidentificationConfirmed: sample.deidentificationConfirmed ?? false,
        licenseConsented: true,
        tags: { create: [{ tagId: tagsByName.get(KNOWLEDGE_TAGS[i % KNOWLEDGE_TAGS.length])!.id }] },
        attachments: sample.attachment
          ? {
              create: {
                objectKey: `library/sample-${slugify(sample.title)}.pdf`,
                fileName: `${slugify(sample.title)}.pdf`,
                mimeType: "application/pdf",
                sizeBytes: 245_000,
              },
            }
          : undefined,
      },
    });

    created += 1;
  }
  console.log(
    `Seeded ${created} sample knowledge item(s) (${SAMPLE_KNOWLEDGE_ITEMS.length - created} already present).`,
  );
}

// Sample threads/posts in two of the seeded forums (§4.13), demonstrating the
// pinned flag and the ForumPost parentPostId self-relation for replies.
async function seedForums() {
  const forumsByName = new Map<string, { id: string }>();
  for (const sample of FORUMS) {
    const forum = await db.forum.upsert({
      where: { name: sample.name },
      update: {},
      create: { name: sample.name, slug: slugify(sample.name), description: sample.description, displayOrder: sample.displayOrder },
    });
    forumsByName.set(sample.name, forum);
  }
  console.log(`Seeded ${FORUMS.length} forums.`);

  // Community-based-categorization initiative, objective 6 — one new Forum
  // per KnowledgeCategory (e.g. "Health-tech", "Clinical Research"),
  // additive alongside (never replacing) the FORUMS above. Community-level
  // access is derived transitively via category.communityId, not a direct
  // Forum.communityId — an earlier revision of this objective seeded one
  // Forum per Community instead (6, later corrected to 8 once verified
  // live); reverted per product decision to seed per-Category instead, so
  // e.g. selecting the "Healthcare" community pill on /forums reveals its
  // individual category forums (Healthcare, Health & Wellness, Health-tech,
  // Clinical Research, Health & Fitness) rather than one combined tile.
  // Dynamic off the live KnowledgeCategory table rather than a hardcoded
  // count/list — 35 today; hardcoding would silently drift out of sync
  // with future taxonomy changes (the same lesson as the stale "6
  // communities" number above). Name matches the Category's own name
  // directly (verified no collision with any FORUMS entry above).
  const categories = await db.knowledgeCategory.findMany({ orderBy: { name: "asc" } });
  for (let index = 0; index < categories.length; index++) {
    const category = categories[index];
    const forum = await db.forum.upsert({
      where: { name: category.name },
      update: { categoryId: category.id },
      create: {
        name: category.name,
        slug: slugify(category.name),
        description: `Discussion for ${category.name}.`,
        displayOrder: FORUMS.length + 100 + index,
        categoryId: category.id,
      },
    });
    forumsByName.set(category.name, forum);
  }
  console.log(`Seeded ${categories.length} category forums.`);

  if (!SEED_SAMPLE_DATA) {
    console.log("SEED_SAMPLE_DATA=false — skipping sample forum threads.");
    return;
  }

  const members = await db.user.findMany({
    where: { role: { in: ["member", "moderator", "admin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (members.length === 0) {
    console.log("No members found yet — skipping forum thread seed (run again once at least one member exists).");
    return;
  }

  const general = forumsByName.get("General")!;
  const existingWelcome = await db.forumThread.findFirst({ where: { title: "Welcome to the Nasiha Forums!" } });
  if (!existingWelcome) {
    const thread = await db.forumThread.create({
      data: { forumId: general.id, authorId: members[0].id, title: "Welcome to the Nasiha Forums!", pinned: true },
    });
    const topLevel = await db.forumPost.create({
      data: { threadId: thread.id, authorId: members[0].id, body: "Welcome everyone — introduce yourself here!" },
    });
    await db.forumPost.create({
      data: {
        threadId: thread.id,
        authorId: members[members.length > 1 ? 1 : 0].id,
        body: "Excited to be here, thanks for setting this up.",
        parentPostId: topLevel.id,
      },
    });
    console.log("Seeded 1 sample forum thread in General.");
  }

  const clinical = forumsByName.get("Clinical Discussions")!;
  const existingCase = await db.forumThread.findFirst({ where: { title: "De-identified case: unusual ECG pattern" } });
  if (!existingCase) {
    const thread = await db.forumThread.create({
      data: { forumId: clinical.id, authorId: members[0].id, title: "De-identified case: unusual ECG pattern" },
    });
    await db.forumPost.create({
      data: {
        threadId: thread.id,
        authorId: members[0].id,
        body: "Sharing a de-identified ECG pattern I'd like the group's thoughts on.",
      },
    });
    console.log("Seeded 1 sample forum thread in Clinical Discussions.");
  }
}

// One-time-per-row backfill: retroactively creates the Events-forum
// discussion thread for every existing Event that doesn't have one yet —
// same shape (thread titled after the event, one system-authored first
// post linking back to /calendar/[id]) as createEvent's opt-in "create a
// discussion thread" checkbox (§4.6), just applied to events that predate
// that feature. Requires seedForums() to have already run.
async function backfillEventForumThreads() {
  const eventsForum = await db.forum.findUnique({ where: { slug: EVENTS_FORUM_SLUG }, select: { id: true } });
  if (!eventsForum) {
    console.log("Events forum not seeded yet — skipping event forum thread backfill.");
    return;
  }

  const events = await db.event.findMany({
    where: { forumThread: null },
    select: { id: true, title: true, hostId: true },
  });

  for (const event of events) {
    const thread = await db.forumThread.create({
      data: { forumId: eventsForum.id, authorId: event.hostId, title: event.title, eventId: event.id },
      select: { id: true },
    });
    await db.forumPost.create({
      data: {
        threadId: thread.id,
        authorId: event.hostId,
        body: `Discussion thread for this event. Event details: ${APP_URL}/calendar/${event.id}`,
      },
    });
  }
  console.log(`Backfilled ${events.length} event discussion thread(s).`);
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
  await seedKnowledgeLibrary();
  await seedForums();
  await backfillEventForumThreads();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
