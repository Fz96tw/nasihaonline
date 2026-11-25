import { ContentUnavailable } from "@/components/content-unavailable";

/**
 * Segment-scoped 404 for /forums/[category]/[threadId]: a sign-in prompt for
 * signed-out visitors (restricted, community-gated-out and Clinical
 * Discussions threads 404 for them) and a generic "isn't available" for
 * members — the same message whether the thread is unknown or restricted.
 */
export default function ForumThreadNotFound() {
  return <ContentUnavailable noun="discussion" sectionHref="/forums" sectionLabel="Forums" />;
}
