"use client";

import { QueryProvider } from "@/components/providers/query-provider";
import { LiveEventsDrawer } from "@/components/sessions/live-events-drawer";
import { LiveEventsStrip } from "@/components/sessions/live-events-strip";

/**
 * The live-event surfaces for the signed-in app header (SiteHeader mounts this
 * only for a signed-in user, so it covers the member AND admin layouts). On
 * desktop: the live-events strip, sticky below BOTH header rows and always visible
 * while an event is live (it follows the search row's height, never hides). On phones the strip renders nothing and the
 * translucent bottom drawer takes over. SiteHeader renders outside the member
 * layout's QueryProvider, so this brings its own.
 */
export function MemberLiveEventsStrip() {
  return (
    <QueryProvider>
      <LiveEventsStrip
        mode="member"
        belowSearchRow
        stickyTop="calc(var(--header-height) + var(--search-row-height))"
      />
      <LiveEventsDrawer audience="member" />
    </QueryProvider>
  );
}
