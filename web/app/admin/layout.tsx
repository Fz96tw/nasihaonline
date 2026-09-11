import { Suspense } from "react";
import { SiteHeader, SiteHeaderSkeleton } from "@/components/site-header";

/**
 * Previously admin pages got their header for free from the root layout
 * (objective 4 moved header rendering out of root — see app/layout.tsx).
 * Each /admin/* page already does its own getSessionUser()/role check
 * directly (not a shared layout gate, see app/admin/page.tsx's comment on
 * why), so this layout only restores the header; it changes no auth
 * behavior.
 *
 * Explicit force-dynamic, not just relying on automatic dynamic-API
 * detection: a Docker build with no database reachable during the image
 * build step hard-fails prerendering (each admin page's own DB reads
 * aren't gated behind a dynamic API Next recognizes early enough to bail
 * out before reaching them) instead of gracefully deferring to request
 * time. The old root-layout force-dynamic covered this implicitly; this
 * restores the same safety explicitly, scoped to just /admin.
 */
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<SiteHeaderSkeleton />}>
        <SiteHeader />
      </Suspense>
      {children}
    </>
  );
}
