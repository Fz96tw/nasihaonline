import { ScrollHeader } from "@/components/scroll-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Split out of site-header.tsx (objective 4) so MarketingHeader — a client
 * component — can use this same fallback without pulling in SiteHeader's
 * server-only Clerk/DB imports: any client component that imports from a
 * module also exporting a server component bundles that whole module,
 * which fails the build the moment `server-only` code (lib/auth.ts, via
 * SiteHeader) ends up in a client bundle.
 *
 * Shown while a header resolves who's looking at the page — keeps the
 * layout's Suspense boundary from blocking the page's initial HTML on that
 * lookup (SiteHeader), or the brief window before Clerk's client SDK
 * resolves the session (MarketingHeader). State-agnostic (doesn't guess
 * signed-in vs guest).
 */
export function SiteHeaderSkeleton() {
  return (
    <ScrollHeader>
      <div className="flex flex-shrink-0 items-center gap-[.65rem]">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </ScrollHeader>
  );
}
