/**
 * Title and meta description for a public event page, /events/[eventId]
 * (SEO objective 51c2e8d6). Dependency-free so node:test can import it.
 */

const META_DESCRIPTION_MIN = 50;
const META_DESCRIPTION_MAX = 160;
const TIME_ZONE = "America/New_York"; // DEFAULT_EVENT_TIME_ZONE in lib/format-date.ts

export function formatEventMetaDate(startsAt: string): string {
  return new Date(startsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

/**
 * The page title before the root layout's "— NASIHA" suffix. The date is
 * part of it because separate events often share a title (a monthly
 * "Knowledge Exchange Hour" is several events, not one recurring series).
 */
export function buildEventPageTitle(event: { title: string; startsAt: string }): string {
  return `${event.title}, ${formatEventMetaDate(event.startsAt)}`;
}

function flatten(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string): string {
  return text.length > META_DESCRIPTION_MAX ? `${text.slice(0, META_DESCRIPTION_MAX - 1).trimEnd()}…` : text;
}

/**
 * The event's own description, cleaned and capped at 160 characters. When
 * that's missing or too short to be useful in search results (under 50
 * characters), a sentence with the type, date and host is added.
 */
export function buildEventMetaDescription(event: {
  description: string | null;
  typeLabel: string;
  startsAt: string;
  hostName: string | null;
}): string {
  const own = flatten(event.description ?? "");
  if (own.length >= META_DESCRIPTION_MIN) return truncate(own);
  const article = /^[aeiou]/i.test(event.typeLabel) ? "An" : "A";
  const host = event.hostName ? `, hosted by ${event.hostName}` : "";
  const summary = `${article} free online ${event.typeLabel.toLowerCase()} on ${formatEventMetaDate(event.startsAt)}${host}, open to the NASIHA professional knowledge-sharing community.`;
  return truncate(own ? `${own.replace(/[.!?]?$/, ".")} ${summary}` : summary);
}
