import { db } from "@/lib/db";
import { EVENTS_FORUM_SLUG } from "@/lib/forums";
import { INTEREST_AREA_LABELS } from "@/lib/interest-areas";

// Absolute, not relative — same rationale as events-server.ts's createEvent:
// lib/linkify.tsx's linkifyText only turns absolute http(s) URLs into links.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

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
  // Science & Philosophy
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
  { activityKey: "write_post", label: "Write a blog post", type: "earned", hours: 0.5 },
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

// Managed blog taxonomy (§4.8 — "should be a managed taxonomy, not hardcoded").
// Mirrors the same broad InterestArea labels members pick from on the
// profile/join form (§3.3/§4.3) rather than a medical-specific list — the
// platform isn't medical-only, so Blog/Library categories shouldn't be either.
const POST_CATEGORIES = Object.values(INTEREST_AREA_LABELS);
const POST_TAGS = ["guidelines", "case-study", "career-advice", "research-methods"];

// Same taxonomy reused for the Knowledge Library so Blog and Library filters
// stay aligned; not mandated as identical by the PRD but a reasonable shared
// default an admin can diverge later via /admin CRUD (not yet built).
const KNOWLEDGE_CATEGORIES = Object.values(INTEREST_AREA_LABELS);
const KNOWLEDGE_TAGS = ["guidelines", "review-article", "recorded-lecture", "case-study"];

// Six seeded forum categories, per Member_Communications.md's table (§4.13).
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
];

// Sample blog posts (mixed draft/published, PRD §4.8) so 5.2+ has real data
// to render immediately. Hosts/authors assigned round-robin from real
// (Clerk-synced) members — same rationale as SAMPLE_EVENTS.
const SAMPLE_POSTS: { title: string; body: string; category: string; published: boolean; tags: string[] }[] = [
  {
    title: "Heart Failure Guidelines: What Changed in the Latest Update",
    body: "A summary of the key changes clinicians should know about in the latest heart failure management guidelines.",
    category: "Healthcare",
    published: true,
    tags: ["guidelines"],
  },
  {
    title: "Navigating Your First Year as an Early-Career Researcher",
    body: "Practical advice for early-career members starting out in clinical research, from finding a mentor to publishing your first paper.",
    category: "Clinical Research",
    published: true,
    tags: ["career-advice", "research-methods"],
  },
  {
    title: "A De-Identified Case Discussion Worth Revisiting",
    body: "Draft notes on a complex oncology case discussed at a recent roundtable — still being written up.",
    category: "Healthcare",
    published: false,
    tags: ["case-study"],
  },
];

async function seedBlog() {
  const categoriesByName = new Map<string, { id: string }>();
  for (const name of POST_CATEGORIES) {
    const category = await db.postCategory.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    categoriesByName.set(name, category);
  }
  console.log(`Seeded ${POST_CATEGORIES.length} post categories.`);

  const tagsByName = new Map<string, { id: string }>();
  for (const name of POST_TAGS) {
    const tag = await db.postTag.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
    tagsByName.set(name, tag);
  }
  console.log(`Seeded ${POST_TAGS.length} post tags.`);

  const authors = await db.user.findMany({
    where: { role: { in: ["member", "moderator", "admin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (authors.length === 0) {
    console.log("No members found yet — skipping blog seed (run again once at least one member exists).");
    return;
  }

  let created = 0;
  for (let i = 0; i < SAMPLE_POSTS.length; i++) {
    const sample = SAMPLE_POSTS[i];
    const existing = await db.post.findFirst({ where: { title: sample.title } });
    if (existing) continue;

    const category = categoriesByName.get(sample.category)!;
    const post = await db.post.create({
      data: {
        title: sample.title,
        slug: slugify(sample.title),
        body: sample.body,
        authorId: authors[i % authors.length].id,
        categoryId: category.id,
        licenseConsented: true,
        publishedAt: sample.published ? new Date() : null,
        tags: { create: sample.tags.map((name) => ({ tagId: tagsByName.get(name)!.id })) },
      },
    });

    // Demonstrate the threaded PostComment self-relation on the first
    // published post: a top-level comment plus a reply.
    if (sample.published && created === 0) {
      const topLevel = await db.postComment.create({
        data: { postId: post.id, authorId: authors[(i + 1) % authors.length].id, body: "Great summary, thank you!" },
      });
      await db.postComment.create({
        data: {
          postId: post.id,
          authorId: authors[i % authors.length].id,
          body: "Glad it was helpful!",
          parentId: topLevel.id,
        },
      });
    }

    created += 1;
  }
  console.log(`Seeded ${created} sample post(s) (${SAMPLE_POSTS.length - created} already present).`);
}

// Sample Knowledge Library items covering the review workflow (§4.9): a
// published article with an attachment, a pending_review case study, and a
// published recorded lecture (youtubeUrl, no attachment).
const SAMPLE_KNOWLEDGE_ITEMS: {
  title: string;
  description: string;
  contentType: "recorded_lecture" | "article" | "case_study" | "guideline";
  status: "pending_review" | "published" | "flagged" | "rejected";
  level: "student_friendly" | "early_career" | "advanced" | "all_levels";
  category: string;
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
    category: "Healthcare",
    attachment: true,
  },
  {
    title: "Case Study: Atypical Presentation in Pediatric Oncology",
    description: "A de-identified case study submitted for Steward review, covering an atypical diagnostic pathway.",
    contentType: "case_study",
    status: "pending_review",
    level: "advanced",
    category: "Healthcare",
    deidentificationConfirmed: true,
  },
  {
    title: "Recorded Lecture: Foundations of Clinical Research Methodology",
    description: "An introductory recorded lecture on clinical research methodology for early-career members.",
    contentType: "recorded_lecture",
    status: "published",
    level: "early_career",
    category: "Clinical Research",
    youtubeUrl: "https://www.youtube.com/watch?v=nasiha-sample-lecture",
  },
];

async function seedKnowledgeLibrary() {
  const categoriesByName = new Map<string, { id: string }>();
  for (const name of KNOWLEDGE_CATEGORIES) {
    const category = await db.knowledgeCategory.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
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

    const category = categoriesByName.get(sample.category)!;
    await db.knowledgeItem.create({
      data: {
        title: sample.title,
        description: sample.description,
        contentType: sample.contentType,
        status: sample.status,
        level: sample.level,
        contributorId: contributors[i % contributors.length].id,
        categoryId: category.id,
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

// Sample threads/posts in two of the six forums (§4.13), demonstrating the
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
  await seedBlog();
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
