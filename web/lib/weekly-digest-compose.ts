// No "server-only" guard and no db import: this is the pure half of the weekly
// digest generator (lib/weekly-digest-server.ts gathers the data), kept
// separate so the privacy/omission rules can be exercised without a database.
import type { WeeklyDigestSettings } from "@/lib/weekly-digest-config";

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

export type WeeklyDigest = {
  title: string;
  /** Plain text — announcement bodies aren't markdown; URLs are linkified by the detail page. */
  body: string;
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
 *  - only public items are listed, with a full URL; restricted/invited-only
 *    items appear as a count, and only when that count reaches
 *    `weeklyDigestPrivateCountMin` — smaller counts are folded into one
 *    general line so a single private item can't be picked out;
 *  - a section with nothing to show is left out entirely, zero stats included;
 *  - disabled sections are skipped;
 *  - Knowledge Hours only ever appears alongside real activity, and the
 *    all-time total only alongside this week's figure;
 *  - a week whose only content is folded private activity and/or Knowledge
 *    Hours is quiet.
 */
export function composeWeeklyDigest(
  data: WeeklyDigestData,
  settings: WeeklyDigestSettings,
  baseUrl: string,
): WeeklyDigest | null {
  const tz = settings.weeklyDigestTimezone;
  const min = settings.weeklyDigestPrivateCountMin;
  const base = baseUrl.replace(/\/$/, "");
  let foldedPrivate = false;

  /** A private total as its own line when it clears the minimum, otherwise folded (and dropped here). */
  const privateLine = (count: number, text: (n: number) => string): string | null => {
    if (count <= 0) return null;
    if (count < min) {
      foldedPrivate = true;
      return null;
    }
    return `• ${text(count)}`;
  };

  const sections: string[] = [];
  const publicTitles: string[] = [];
  const counts = { library: 0, events: 0, threads: 0 };

  if (settings.weeklyDigestIncludeNewMembers && data.newMembers > 0) {
    sections.push(
      `New members\n${data.newMembers} ${plural(data.newMembers, "member joined us.", "members joined us.")}`,
    );
  }

  if (settings.weeklyDigestIncludeContent) {
    const lines = data.library.listed.map((item) => `• ${item.title}\n${base}/library/${item.id}`);
    const extra = privateLine(data.library.restrictedCount, (n) =>
      n === 1 ? "1 more resource was shared with limited access." : `${n} more resources were shared with limited access.`,
    );
    if (extra) lines.push(extra);
    if (lines.length > 0) {
      sections.push(`New library content\n${lines.join("\n")}`);
      counts.library = data.library.listed.length + (extra ? data.library.restrictedCount : 0);
      publicTitles.push(...data.library.listed.map((item) => item.title));
    }
  }

  if (settings.weeklyDigestIncludeEvents) {
    const lines = data.events.listed.map(
      (event) => `• ${event.title}, ${formatEventTime(event.startsAt, tz)}\n${base}/calendar/${event.id}`,
    );
    const extra = privateLine(data.events.invitedCount, (n) =>
      n === 1 ? "1 more event is invite-only." : `${n} more events are invite-only.`,
    );
    if (extra) lines.push(extra);
    if (lines.length > 0) {
      sections.push(`Upcoming events\n${lines.join("\n")}`);
      counts.events = data.events.listed.length + (extra ? data.events.invitedCount : 0);
      publicTitles.push(...data.events.listed.map((event) => event.title));
    }
  }

  if (settings.weeklyDigestIncludeForums) {
    const lines = data.forumThreads.listed.map(
      (thread) => `• ${thread.title}\n${base}/forums/${thread.forumSlug}/${thread.id}`,
    );
    const extra = privateLine(data.forumThreads.privateCount, (n) =>
      n === 1 ? "1 new private discussion started." : `${n} new private discussions started.`,
    );
    if (extra) lines.push(extra);
    if (lines.length > 0) {
      sections.push(`New forum threads\n${lines.join("\n")}`);
      counts.threads = data.forumThreads.listed.length + (extra ? data.forumThreads.privateCount : 0);
      publicTitles.push(...data.forumThreads.listed.map((thread) => thread.title));
    }
  }

  if (settings.weeklyDigestIncludePeerReviews && data.peerReviewsStarted > 0) {
    sections.push(
      `Peer reviews\n${data.peerReviewsStarted} ${plural(data.peerReviewsStarted, "peer review", "peer reviews")} started this week.`,
    );
  }

  if (settings.weeklyDigestIncludeReplies && data.replies > 0) {
    sections.push(
      `Replies\n${data.replies} ${plural(data.replies, "reply was", "replies were")} posted across the community.`,
    );
  }

  // Quiet week: nothing but (possibly) folded private activity or Knowledge Hours.
  if (sections.length === 0) return null;

  const hours = data.knowledgeHours;
  if (settings.weeklyDigestIncludeKnowledgeHours && hours.earnedThisWeek > 0) {
    sections.push(
      `Knowledge Hours\n${formatHours(hours.earnedThisWeek)} Knowledge ${plural(hours.earnedThisWeek, "Hour", "Hours")} earned this week. ${formatHours(hours.earnedAllTime)} all-time.`,
    );
  }

  if (foldedPrivate) {
    sections.push("Private activity\nSome additional activity took place in private spaces this week.");
  }

  const lastDay = new Date(data.windowEnd.getTime() - 1);
  const title = `This week at NASIHA: ${formatDay(data.windowStart, tz)} – ${formatDay(lastDay, tz)}`;
  const body = [
    "Here's what happened in our community this week.",
    ...sections,
    "See you in the community.",
  ].join("\n\n");

  return {
    title,
    body,
    highlights: {
      newMembers: settings.weeklyDigestIncludeNewMembers ? data.newMembers : 0,
      libraryTotal: counts.library,
      eventsTotal: counts.events,
      forumThreadsTotal: counts.threads,
      peerReviewsStarted: settings.weeklyDigestIncludePeerReviews ? data.peerReviewsStarted : 0,
      replies: settings.weeklyDigestIncludeReplies ? data.replies : 0,
      knowledgeHoursThisWeek: settings.weeklyDigestIncludeKnowledgeHours ? hours.earnedThisWeek : 0,
      publicTitles: publicTitles.slice(0, 5),
    },
  };
}
