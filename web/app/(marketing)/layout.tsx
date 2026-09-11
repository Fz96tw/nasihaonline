import { MarketingHeader } from "@/components/marketing-header";

/**
 * The public marketing route group (objective 4) — home, about + sub-pages,
 * our-team, events, join, donate, privacy, contact, getinvolved,
 * communities. Renders the client-auth MarketingHeader instead of the
 * server-rendered SiteHeader that (member)/admin use, so these pages can be
 * static/ISR instead of forced dynamic just to resolve who's looking at the
 * header. See app/layout.tsx's comment and components/marketing-header.tsx.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      {children}
    </>
  );
}
