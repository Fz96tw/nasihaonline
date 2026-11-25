import { ContentUnavailable } from "@/components/content-unavailable";

/**
 * Segment-scoped 404 for /library/[id]: a sign-in prompt for signed-out
 * visitors (restricted items 404 for them) and a generic "isn't available"
 * for members — the same message whether the id is unknown or restricted.
 */
export default function LibraryItemNotFound() {
  return <ContentUnavailable noun="resource" sectionHref="/library" sectionLabel="Knowledge Library" />;
}
