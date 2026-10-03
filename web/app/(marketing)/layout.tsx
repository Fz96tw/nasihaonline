import { MarketingHeader } from "@/components/marketing-header";
import { QueryProvider } from "@/components/providers/query-provider";
import { LiveEventsDrawer } from "@/components/sessions/live-events-drawer";
import { LiveEventsStrip } from "@/components/sessions/live-events-strip";
import { PublicSessionReminder } from "@/components/sessions/public-session-reminder";

/**
 * The public marketing route group (objective 4) — home, about + sub-pages,
 * our-team, events, join, donate, privacy, contact, getinvolved,
 * communities. Renders the client-auth MarketingHeader instead of the
 * server-rendered SiteHeader that (member)/admin use, so these pages can be
 * static/ISR instead of forced dynamic just to resolve who's looking at the
 * header. See app/layout.tsx's comment and components/marketing-header.tsx.
 *
 * One QueryProvider wraps everything so the signed-out live-events strip,
 * popup, phone drawer and the /events badges share polling queries instead of
 * each polling on its own. On phones the drawer replaces the popup and strip.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <MarketingHeader />
      <LiveEventsStrip />
      {children}
      <PublicSessionReminder />
      <LiveEventsDrawer />
    </QueryProvider>
  );
}
