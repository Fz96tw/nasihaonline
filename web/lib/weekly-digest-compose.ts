// No "server-only" guard and no db import: this is the pure half of the weekly
// digest generator (lib/weekly-digest-server.ts gathers the data), kept
// separate so the privacy/omission rules can be exercised without a database.
import type { WeeklyDigestSettings } from "@/lib/weekly-digest-config";
import { periodWording } from "@/lib/weekly-digest-schedule";

type Listed = { id: string; title: string };

export type WeeklyDigestData = {
  windowStart: Date;
  windowEnd: Date;
  newMembers: number;
  library: { listed: Listed[]; restrictedCount: number };
  events: { listed: (Listed & { startsAt: Date })[]; invitedCount: number };
  forumThreads: { listed: (Listed & { forumSlug: string })[]; privateCount: number };
  peerReviewsStarted: number;
  replies: number;
  knowledgeHours: { earnedThisWeek: number; earnedAllTime: number };
};

export type DigestIcon = "members" | "library" | "events" | "forums" | "reviews" | "replies" | "hours" | "private";

export type DigestSection = {
  icon: DigestIcon;
  /** `ahead` sections (upcoming events) are looking forward; everything else, or absent, looks back over the period. */
  group?: "ahead";
  heading: string;
  /** Public items, each a link by in-app path. Defined (even if empty) for list-style sections, undefined for single-statement ones. */
  items?: { title: string; path: string; meta?: string }[];
  /** Counts and plain statements; bulleted when the section has `items`, plain otherwise. */
  lines: string[];
};

/**
 * The digest as structured data, saved on the Announcement (digestContent) so
 * the detail page can render stat tiles and section cards. The plain-text
 * `body` is derived from the same object (renderDigestBody), so the two
 * can't drift. Contains only what the body already contains: public titles
 * and counts.
 */
export type DigestContent = {
  intro: string;
  outro: string;
  /** One line of headline numbers, e.g. "12 new members · 4 new resources" — the feed row's excerpt. */
  summary: string;
  /** Group labels, e.g. "Looking back: Sep 29 – Oct 6" and "Coming up". Absent on digests made before the split. */
  lookBackLabel?: string;
  comingUpLabel?: string;
  /** `ahead` stats count scheduled things, not past activity. */
  stats: { icon: DigestIcon; label: string; value: string; ahead?: boolean }[];
  sections: DigestSection[];
};

export type WeeklyDigest = {
  title: string;
  /** Plain text with `[title](url)` links — the announcement detail page renders those as friendly link text (lib/linkify.tsx). */
  body: string;
  /** Structured form of the same digest, for the designed detail page and feed row. */
  content: DigestContent;
  /** Headline numbers and a few public titles, for the inactive-member teaser email. */
  highlights: {
    newMembers: number;
    libraryTotal: number;
    eventsTotal: number;
    forumThreadsTotal: number;
    peerReviewsStarted: number;
    replies: number;
    knowledgeHoursThisWeek: number;
    publicTitles: string[];
  };
};

/**
 * A `[label](url)` link, which announcement bodies render as friendly link
 * text (lib/linkify.tsx). Brackets in the label would end it early, so they
 * become parentheses.
 */
function link(label: string, url: string) {
  return `[${label.replace(/\[/g, "(").replace(/\]/g, ")")}](${url})`;
}

/** The plain-text body (`[title](url)` links, bulleted lists) for a digest's structured content. */
export function renderDigestBody(content: DigestContent, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const renderSection = (section: DigestSection) => {
    const itemLines = (section.items ?? []).map(
      (item) => `• ${link(item.title, `${base}${item.path}`)}${item.meta ? ` — ${item.meta}` : ""}`,
    );
    const lines = section.lines.map((line) => (section.items ? `• ${line}` : line));
    return [section.heading, ...itemLines, ...lines].join("\n");
  };
  const past = content.sections.filter((section) => section.group !== "ahead").map(renderSection);
  const ahead = content.sections.filter((section) => section.group === "ahead").map(renderSection);
  return [
    content.intro,
    ...(content.lookBackLabel && past.length > 0 ? [content.lookBackLabel] : []),
    ...past,
    ...(content.comingUpLabel && ahead.length > 0 ? [content.comingUpLabel] : []),
    ...ahead,
    content.outro,
  ].join("\n\n");
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

function formatHours(hours: number) {
  return Number(hours.toFixed(1)).toLocaleString("en-US");
}

function formatDay(date: Date, timeZone: string) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

function formatEventTime(date: Date, timeZone: string) {
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone });
  return `${day}, ${time}`;
}

/**
 * Turns a week's gathered activity into the digest post, or null for a quiet
 * week. Rules (see the Weekly Community Digest initiative):
 *  - only public items are listed, each as a link; restricted/invited-only
 *    items appear as a count, and only when that count reaches
 *    `weeklyDigestPrivateCountMin` — smaller counts are folded into one
 *    general line so a single private item can't be picked out;
 *  - a section with nothing to show is left out entirely, zero stats included;
 *  - disabled sections are skipped;
 *  - Knowledge Hours only ever appears alongside real activity, and the
 *    all-time total only alongside this week's figure;
 *  - invite-only events are the exception to that minimum: they are always
 *    counted (never named) when scheduled;
 *  - a week whose only content is folded private activity and/or Knowledge
 *    Hours is quiet.
 */
export function composeWeeklyDigest(
  data: WeeklyDigestData,
  settings: WeeklyDigestSettings,
  baseUrl: string,
): WeeklyDigest | null {
  const tz = settings.weeklyDigestTimezone;
  const wording = periodWording(settings.weeklyDigestFrequency);
  const min = settings.weeklyDigestPrivateCountMin;
  let foldedPrivate = false;

  /** A private total as its own line when it clears the minimum, otherwise folded (and dropped here). */
  const privateLine = (count: number, text: (n: number) => string): string | null => {
    if (count <= 0) return null;
    if (count < min) {
      foldedPrivate = true;
      return null;
    }
    return text(count);
  };

  const sections: DigestSection[] = [];
  // Upcoming events look ahead, so they're collected apart and added last, under "Coming up".
  let eventsSection: DigestSection | null = null;
  const publicTitles: string[] = [];
  const counts = { library: 0, events: 0, threads: 0 };

  if (settings.weeklyDigestIncludeNewMembers && data.newMembers > 0) {
    sections.push({
      icon: "members",
      heading: "New members",
      lines: [`${data.newMembers} ${plural(data.newMembers, "member joined us.", "members joined us.")}`],
    });
  }

  if (settings.weeklyDigestIncludeContent) {
    const items = data.library.listed.map((item) => ({ title: item.title, path: `/library/${item.id}` }));
    const extra = privateLine(data.library.restrictedCount, (n) =>
      n === 1 ? "1 more resource was shared with limited access." : `${n} more resources were shared with limited access.`,
    );
    if (items.length > 0 || extra) {
      sections.push({ icon: "library", heading: "New library content", items, lines: extra ? [extra] : [] });
      counts.library = items.length + (extra ? data.library.restrictedCount : 0);
      publicTitles.push(...data.library.listed.map((item) => item.title));
    }
  }

  if (settings.weeklyDigestIncludeEvents) {
    const items = data.events.listed.map((event) => ({
      title: event.title,
      path: `/calendar/${event.id}`,
      meta: formatEventTime(event.startsAt, tz),
    }));
    // Unlike other private totals, invite-only events are always counted
    // (never folded below the minimum): a scheduled event is only ever
    // mentioned as a number, never named, and members want to know they exist.
    const invited = data.events.invitedCount;
    const extra =
      invited <= 0
        ? null
        : items.length > 0
          ? invited === 1
            ? "1 more event is invite-only."
            : `${invited} more events are invite-only.`
          : invited === 1
            ? "1 invite-only event is scheduled."
            : `${invited} invite-only events are scheduled.`;
    if (items.length > 0 || extra) {
      eventsSection = { icon: "events", group: "ahead", heading: "Upcoming events", items, lines: extra ? [extra] : [] };
      counts.events = items.length + invited;
      publicTitles.push(...data.events.listed.map((event) => event.title));
    }
  }

  if (settings.weeklyDigestIncludeForums) {
    const items = data.forumThreads.listed.map((thread) => ({
      title: thread.title,
      path: `/forums/${thread.forumSlug}/${thread.id}`,
    }));
    const extra = privateLine(data.forumThreads.privateCount, (n) =>
      n === 1 ? "1 new private discussion started." : `${n} new private discussions started.`,
    );
    if (items.length > 0 || extra) {
      sections.push({ icon: "forums", heading: "New forum threads", items, lines: extra ? [extra] : [] });
      counts.threads = items.length + (extra ? data.forumThreads.privateCount : 0);
      publicTitles.push(...data.forumThreads.listed.map((thread) => thread.title));
    }
  }

  if (settings.weeklyDigestIncludePeerReviews && data.peerReviewsStarted > 0) {
    sections.push({
      icon: "reviews",
      heading: "Peer reviews",
      lines: [`${data.peerReviewsStarted} ${plural(data.peerReviewsStarted, "peer review", "peer reviews")} started ${wording.phrase}.`],
    });
  }

  if (settings.weeklyDigestIncludeReplies && data.replies > 0) {
    sections.push({
      icon: "replies",
      heading: "Replies",
      lines: [`${data.replies} ${plural(data.replies, "reply was", "replies were")} posted across the community.`],
    });
  }

  // Quiet week: nothing but (possibly) folded private activity or Knowledge Hours.
  if (sections.length === 0 && !eventsSection) return null;

  const hours = data.knowledgeHours;
  const showHours = settings.weeklyDigestIncludeKnowledgeHours && hours.earnedThisWeek > 0;
  if (showHours) {
    sections.push({
      icon: "hours",
      heading: "Knowledge Hours",
      lines: [
        `${formatHours(hours.earnedThisWeek)} Knowledge ${plural(hours.earnedThisWeek, "Hour", "Hours")} earned ${wording.phrase}. ${formatHours(hours.earnedAllTime)} all-time.`,
      ],
    });
  }

  if (foldedPrivate) {
    sections.push({
      icon: "private",
      heading: "Private activity",
      lines: [`Some additional activity took place in private spaces ${wording.phrase}.`],
    });
  }

  const members = settings.weeklyDigestIncludeNewMembers ? data.newMembers : 0;
  const reviews = settings.weeklyDigestIncludePeerReviews ? data.peerReviewsStarted : 0;
  const replies = settings.weeklyDigestIncludeReplies ? data.replies : 0;

  const stats: DigestContent["stats"] = [];
  const addStat = (icon: DigestIcon, count: number, one: string, many: string, ahead = false) => {
    if (count > 0) {
      stats.push({ icon, value: count.toLocaleString("en-US"), label: count === 1 ? one : many, ...(ahead ? { ahead: true } : {}) });
    }
  };
  addStat("members", members, "new member", "new members");
  addStat("library", counts.library, "new resource", "new resources");
  addStat("forums", counts.threads, "new thread", "new threads");
  addStat("reviews", reviews, "peer review started", "peer reviews started");
  addStat("replies", replies, "reply", "replies");
  if (showHours) stats.push({ icon: "hours", value: formatHours(hours.earnedThisWeek), label: "Knowledge Hours earned" });
  addStat("events", counts.events, "event scheduled", "events scheduled", true);

  // Past numbers first, then what's ahead: "12 new members · 5 new resources · coming up: 2 events".
  const pastSummary = stats
    .filter((stat) => !stat.ahead && stat.icon !== "hours")
    .slice(0, 3)
    .map((stat) => `${stat.value} ${stat.label}`);
  const aheadStat = stats.find((stat) => stat.ahead);
  const summary = [
    ...pastSummary,
    ...(aheadStat ? [`coming up: ${aheadStat.value} ${aheadStat.value === "1" ? "event" : "events"}`] : []),
  ].join(" · ");

  if (eventsSection) sections.push(eventsSection);

  const lastDay = new Date(data.windowEnd.getTime() - 1);
  const periodLabel = `${formatDay(data.windowStart, tz)} – ${formatDay(lastDay, tz)}`;
  const title = `${wording.titlePrefix}: ${periodLabel}`;
  const content: DigestContent = {
    intro: eventsSection
      ? `Here's what happened in our community ${wording.phrase}, and what's coming up next.`
      : `Here's what happened in our community ${wording.phrase}.`,
    outro: "See you in the community.",
    summary,
    lookBackLabel: `Looking back: ${periodLabel}`,
    comingUpLabel: "Coming up",
    stats,
    sections,
  };

  return {
    title,
    body: renderDigestBody(content, baseUrl),
    content,
    highlights: {
      newMembers: members,
      libraryTotal: counts.library,
      eventsTotal: counts.events,
      forumThreadsTotal: counts.threads,
      peerReviewsStarted: reviews,
      replies,
      knowledgeHoursThisWeek: settings.weeklyDigestIncludeKnowledgeHours ? hours.earnedThisWeek : 0,
      publicTitles: publicTitles.slice(0, 5),
    },
  };
}

/**
 * Reads a stored `digestContent` JSON value back into a DigestContent, or
 * null when it's absent or not the expected shape — callers then fall back to
 * the plain-text body, which is also what an old or admin-edited digest gets.
 */
export function digestContentOf(value: unknown): DigestContent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DigestContent>;
  if (
    typeof candidate.summary !== "string" ||
    typeof candidate.intro !== "string" ||
    typeof candidate.outro !== "string" ||
    !Array.isArray(candidate.stats) ||
    !Array.isArray(candidate.sections)
  ) {
    return null;
  }
  return candidate as DigestContent;
}
