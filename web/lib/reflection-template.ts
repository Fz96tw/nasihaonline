// Pure template engine for the Weekly Reflection post — no db, no "@/" alias,
// so the poster, the admin live preview (client) and the node:test runner all
// use the very same code, and the preview can't drift from what gets posted.
import {
  FORUM_POST_BODY_MAX,
  FORUM_TITLE_MAX,
  REFLECTION_TITLE_QUOTE_MAX,
  REFLECTION_AUTHOR_MAX,
  REFLECTION_PROMPT_MAX,
  REFLECTION_QUOTE_TEXT_MAX,
  REFLECTION_SOURCE_MAX,
} from "./reflection-limits.ts";

export const TITLE_PLACEHOLDERS = ["weekOf", "quote"] as const;
export const BODY_PLACEHOLDERS = ["quote", "author", "source", "attribution", "prompt", "weekOf"] as const;

export const PLACEHOLDER_HELP: Record<(typeof BODY_PLACEHOLDERS)[number], string> = {
  quote: "The quote text (required in the message)",
  author: "Who said it",
  source: "The book or speech, if any (blank when none)",
  attribution: "Author, plus the source when there is one",
  prompt: "The reflection question for this quote",
  weekOf: "The Monday of the current week, e.g. Oct 5, 2026",
};

// These reproduce the post exactly as it was before the template was editable:
// the title "Weekly Reflection: week of Jan 7, 2030" and the body
// “quote” / — attribution / blank line / prompt.
export const DEFAULT_TITLE_TEMPLATE = "Weekly Reflection: week of {weekOf}";
export const DEFAULT_BODY_TEMPLATE = "“{quote}”\n— {attribution}\n\n{prompt}";

export const TITLE_PLACEHOLDER_HELP: Record<(typeof TITLE_PLACEHOLDERS)[number], string> = {
  weekOf: "The Monday of the current week, e.g. Oct 5, 2026",
  quote: `The quote, shortened to ${REFLECTION_TITLE_QUOTE_MAX} characters with an ellipsis if longer`,
};

export type ReflectionTemplateValues = Record<(typeof BODY_PLACEHOLDERS)[number], string>;

/** "Oct 5, 2026" for the (UTC) Monday of the week. */
export function formatWeekOf(weekStart: Date): string {
  return weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildReflectionValues(
  quote: { text: string; author: string; source: string | null; prompt: string },
  weekStart: Date,
): ReflectionTemplateValues {
  return {
    quote: quote.text,
    author: quote.author,
    source: quote.source ?? "",
    attribution: quote.source ? `${quote.author}, ${quote.source}` : quote.author,
    prompt: quote.prompt,
    weekOf: formatWeekOf(weekStart),
  };
}

/** The quote for use inside a (single-line, length-capped) title: whitespace collapsed, cut at a word boundary with "…" if too long. */
export function shortenQuoteForTitle(text: string, max: number = REFLECTION_TITLE_QUOTE_MAX): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  const cut = oneLine.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-\u2014]+$/, "")}\u2026`;
}

export function buildTitleValues(quote: { text: string }, weekStart: Date): { weekOf: string; quote: string } {
  return { weekOf: formatWeekOf(weekStart), quote: shortenQuoteForTitle(quote.text) };
}

const PLACEHOLDER_PATTERN = /\{([A-Za-z]+)\}/g;

/**
 * Single left-to-right pass: a value is never re-scanned, so a quote that
 * happens to contain "{prompt}" is shown literally rather than expanded.
 * Unknown tokens are left as written (validation rejects them before they can
 * be saved; this just keeps rendering total).
 */
export function renderReflectionTemplate(template: string, values: Partial<ReflectionTemplateValues>): string {
  return template.replace(PLACEHOLDER_PATTERN, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? (values[name as keyof ReflectionTemplateValues] ?? "") : token,
  );
}

/** Distinct `{tokens}` in `template` that aren't in `allowed`, in order of appearance. */
export function findUnknownPlaceholders(template: string, allowed: readonly string[]): string[] {
  const unknown: string[] = [];
  for (const match of Array.from(template.matchAll(PLACEHOLDER_PATTERN))) {
    if (!allowed.includes(match[1]) && !unknown.includes(match[0])) unknown.push(match[0]);
  }
  return unknown;
}

const MAX_VALUE_LENGTH: ReflectionTemplateValues = {
  quote: "x".repeat(REFLECTION_QUOTE_TEXT_MAX),
  author: "x".repeat(REFLECTION_AUTHOR_MAX),
  source: "x".repeat(REFLECTION_SOURCE_MAX),
  attribution: "x".repeat(REFLECTION_AUTHOR_MAX + 2 + REFLECTION_SOURCE_MAX),
  prompt: "x".repeat(REFLECTION_PROMPT_MAX),
  weekOf: "Sep 30, 2026",
};

/** Longest the body could render to if every field were at its maximum — must stay under the forum's post cap. */
export function worstCaseBodyLength(template: string): number {
  return renderReflectionTemplate(template, MAX_VALUE_LENGTH).length;
}

export function fitsForumPost(template: string): boolean {
  return worstCaseBodyLength(template) <= FORUM_POST_BODY_MAX;
}

/** Longest the title could render to (quote at its title cap) — must fit the forum's title limit. */
export function worstCaseTitleLength(template: string): number {
  return renderReflectionTemplate(template, { weekOf: "Sep 30, 2026", quote: "x".repeat(REFLECTION_TITLE_QUOTE_MAX) }).length;
}

export function fitsForumTitle(template: string): boolean {
  return worstCaseTitleLength(template) <= FORUM_TITLE_MAX;
}
