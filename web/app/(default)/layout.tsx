import { Suspense } from "react";
import { SiteHeader, SiteHeaderSkeleton } from "@/components/site-header";

/**
 * Everything that isn't (member), admin, or (marketing) — accept-invite,
 * account-suspended, blog, sign-in, surveys, welcome. Grouped here purely
 * so root layout no longer has to render a header for every route itself
 * (objective 4); unlike (marketing), this keeps the original
 * server-rendered SiteHeader unchanged, since every page in this group is
 * already dynamic for its own reasons (each does its own getSessionUser()
 * or is a Clerk auth-flow page) — there's no static-rendering win to chase
 * here, so no reason to touch their behavior.
 *
 * Explicit force-dynamic, not just relying on automatic dynamic-API
 * detection: a Docker build with no database reachable during the image
 * build step hard-fails prerendering (each page's own DB reads, e.g.
 * blog/layout.tsx's getSessionUser(), aren't gated behind a dynamic API
 * Next recognizes early enough to bail out before reaching them) instead
 * of gracefully deferring to request time. The old root-layout
 * force-dynamic covered this implicitly; this restores the same safety
 * explicitly, scoped to just this group.
 */
export const dynamic = "force-dynamic";

export default function DefaultHeaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      {children}
    </>
  );
}
