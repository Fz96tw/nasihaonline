/**
 * Whether a publicly readable forum thread should be offered to search
 * engines (sitemap.xml entry + no robots noindex). Shared by
 * getPublicForumThreadSitemapEntries and the thread page's generateMetadata
 * so the two can't disagree (objective 441369e6).
 *
 * Event and Library discussion threads are auto-created with a one-line
 * placeholder opening post ("Discussion thread for this event/resource.").
 * Until someone actually replies they're thin, near-duplicate pages (a
 * recurring event yields one identically titled thread per session), so
 * they stay readable but unindexed. A standalone thread's opening post is
 * real member-written content, so it's indexable from the start.
 *
 * Callers apply PUBLIC_FORUM_THREAD_WHERE (or an equivalent visibility
 * check) first; this only decides indexability among public threads.
 * Dependency-free so node:test can import it directly.
 */
export function isIndexableForumThread(thread: {
  eventId: string | null;
  knowledgeItemId: string | null;
  /** Posts in the thread with removed = false, the opening post included. */
  visiblePostCount: number;
}): boolean {
  const autoCreated = thread.eventId !== null || thread.knowledgeItemId !== null;
  return !autoCreated || thread.visiblePostCount >= 2;
}
