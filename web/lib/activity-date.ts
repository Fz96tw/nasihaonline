/**
 * Which date a member's own-content list row should show, and what to call it.
 *
 * A row's `createdAt` is the moment it was first saved — for something that sat
 * as a draft and went live weeks later, that is not when it was published, and
 * re-saving the draft never moves it. So: a draft shows when it was last saved,
 * a published item shows when it went live, and anything submitted but not yet
 * published (e.g. awaiting Steward review) falls back to when it was created.
 * Same `publishedAt ?? createdAt` rule the What's New feed already uses.
 */
export type ActivityDateLabel = "Last saved" | "Published" | "Created";

export function activityDate({
  isDraft,
  updatedAt,
  publishedAt,
  createdAt,
}: {
  isDraft: boolean;
  /** ISO timestamp. */
  updatedAt: string;
  /** ISO timestamp, null until the item actually goes live. */
  publishedAt: string | null;
  /** ISO timestamp. */
  createdAt: string;
}): { label: ActivityDateLabel; date: string } {
  if (isDraft) return { label: "Last saved", date: updatedAt };
  if (publishedAt) return { label: "Published", date: publishedAt };
  return { label: "Created", date: createdAt };
}
