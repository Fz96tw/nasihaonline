import { ContentUnavailable } from "@/components/content-unavailable";

/**
 * Segment-scoped 404 for /review-feedback/[id]: a sign-in prompt for
 * signed-out visitors (every peer review item is members-only) and a generic
 * "isn't available" for members who can't see it — the same message whether
 * the id is unknown or the item isn't shared with them.
 */
export default function ReviewItemNotFound() {
  return <ContentUnavailable noun="peer review item" sectionHref="/review-feedback" sectionLabel="Peer Review & Feedback" />;
}
