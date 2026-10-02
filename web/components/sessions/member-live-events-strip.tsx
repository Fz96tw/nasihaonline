"use client";

import { QueryProvider } from "@/components/providers/query-provider";
import { LiveEventsStrip } from "@/components/sessions/live-events-strip";

/**
 * The live-events strip for the signed-in app header (SiteHeader mounts it
 * right below HeaderSearchRow, only for a signed-in user). SiteHeader renders
 * outside the member layout's QueryProvider, so this brings its own. It sticks
 * below BOTH header rows and slides in lockstep with the search row.
 */
export function MemberLiveEventsStrip() {
  return (
    <QueryProvider>
      <LiveEventsStrip
        mode="member"
        followSearchRow
        stickyTop="calc(var(--header-height) + var(--search-row-height))"
      />
    </QueryProvider>
  );
}
