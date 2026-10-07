// Client-safe (no db import) — shared by lib/settings.ts, the settings API's
// Zod schema and the admin form, same split as lib/admission-phase.ts.

export type WeeklyDigestSettings = {
  weeklyDigestEnabled: boolean;
  weeklyDigestDayOfWeek: number;
  weeklyDigestHour: number;
  weeklyDigestTimezone: string;
  weeklyDigestAutoPublish: boolean;
  weeklyDigestPrivateCountMin: number;
  weeklyDigestIncludeNewMembers: boolean;
  weeklyDigestIncludeContent: boolean;
  weeklyDigestIncludeEvents: boolean;
  weeklyDigestIncludeForums: boolean;
  weeklyDigestIncludePeerReviews: boolean;
  weeklyDigestIncludeReplies: boolean;
  weeklyDigestIncludeKnowledgeHours: boolean;
  weeklyDigestEmailLapsed: boolean;
  weeklyDigestLapsedDays: number;
  weeklyDigestMaxEmailsPerMember: number;
  weeklyDigestEmailSubject: string;
  weeklyDigestEmailIntro: string;
};

export const WEEKLY_DIGEST_EMAIL_SUBJECT_MAX = 150;
export const WEEKLY_DIGEST_EMAIL_INTRO_MAX = 1000;

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const WEEKLY_DIGEST_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "UTC", label: "UTC" },
] as const;

export const WEEKLY_DIGEST_TIMEZONE_VALUES = WEEKLY_DIGEST_TIMEZONES.map((tz) => tz.value) as [
  string,
  ...string[],
];

/** Which activity sections the digest covers, keyed to their SiteSettings toggle. */
export const WEEKLY_DIGEST_SECTIONS = [
  { key: "weeklyDigestIncludeNewMembers", label: "New members", hint: "A count of members who joined this week." },
  { key: "weeklyDigestIncludeContent", label: "New library content", hint: "Public resources listed by title; restricted ones counted only." },
  { key: "weeklyDigestIncludeEvents", label: "Upcoming events", hint: "Public events listed by title; invited-only ones counted only." },
  { key: "weeklyDigestIncludeForums", label: "New forum threads", hint: "Public threads listed by title; private ones counted only." },
  { key: "weeklyDigestIncludePeerReviews", label: "Peer reviews started", hint: "Counted only, never listed." },
  { key: "weeklyDigestIncludeReplies", label: "Replies posted", hint: "A single total across all threads." },
  { key: "weeklyDigestIncludeKnowledgeHours", label: "Knowledge Hours", hint: "Total Knowledge Hours earned this week, and the community's all-time total." },
] as const;
