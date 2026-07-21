import { Fragment, type ReactNode } from "react";
import { linkifyText } from "@/lib/linkify";

export type MentionCandidate = { id: string; name: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type MentionSpan = { start: number; end: number; candidate: MentionCandidate };

/**
 * Finds `@Full Name` occurrences in `body` matching a real, Directory-eligible
 * member's exact name (case-insensitive, word-boundary) — no separate
 * username/handle field exists on User, so the display name is the tag
 * target. Longest names are matched first so e.g. "Ali" doesn't shadow a
 * match for "Ali Hassan" occurring at the same position.
 */
function findMentionSpans(body: string, candidates: MentionCandidate[]): MentionSpan[] {
  const spans: MentionSpan[] = [];
  const sorted = [...candidates]
    .filter((candidate) => candidate.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const claimed = new Array<boolean>(body.length).fill(false);

  for (const candidate of sorted) {
    const pattern = new RegExp(`@${escapeRegExp(candidate.name)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) claimed[i] = true;
      spans.push({ start, end, candidate });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** Distinct members tagged in `body` — used to decide who gets a `mention` notification. */
export function findMentionedMembers(body: string, candidates: MentionCandidate[]): MentionCandidate[] {
  const spans = findMentionSpans(body, candidates);
  const seen = new Map<string, MentionCandidate>();
  for (const span of spans) seen.set(span.candidate.id, span.candidate);
  return Array.from(seen.values());
}

/**
 * Renders `body` with matched `@Full Name` mentions as a styled tag and
 * everything else run through linkifyText, same "plain text in, rich nodes
 * out" contract as linkifyText itself.
 */
export function renderTextWithMentions(body: string, candidates: MentionCandidate[]): ReactNode {
  const spans = findMentionSpans(body, candidates);
  if (spans.length === 0) return linkifyText(body);

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const span of spans) {
    if (span.start > lastIndex) {
      parts.push(<Fragment key={key++}>{linkifyText(body.slice(lastIndex, span.start))}</Fragment>);
    }
    parts.push(
      <span key={key++} className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary">
        @{span.candidate.name}
      </span>,
    );
    lastIndex = span.end;
  }

  if (lastIndex < body.length) {
    parts.push(<Fragment key={key++}>{linkifyText(body.slice(lastIndex))}</Fragment>);
  }

  return parts;
}
