import { Suspense } from "react";
import { SiteHeader, SiteHeaderSkeleton } from "@/components/site-header";

/**
 * Previously admin pages got their header for free from the root layout
 * (objective 4 moved header rendering out of root — see app/layout.tsx).
 * Each /admin/* page already does its own getSessionUser()/role check
 * directly (not a shared layout gate, see app/admin/page.tsx's comment on
 * why), so this layout only restores the header; it changes no auth
 * behavior.
 */
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
