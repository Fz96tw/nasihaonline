"use client";

import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, Rss } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AdminReviewIcon } from "@/components/admin/admin-review-icon";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { ScrollHeader } from "@/components/scroll-header";
import { DesktopNavLinks } from "@/components/desktop-nav-links";
import { SiteHeaderSkeleton } from "@/components/site-header-skeleton";

/**
 * Client-auth counterpart to SiteHeader, used only by app/(marketing)'s
 * layout. SiteHeader resolves the session server-side (a Clerk auth() call,
 * which reads the session cookie — a Next.js "dynamic API" — forcing every
 * route in its render tree to be dynamically rendered per-request). That's
 * free on (member)/admin, which are already dynamic for their own reasons,
 * but it was silently keeping every public marketing page dynamic too, for
 * no benefit (objective 4 — verified empirically that removing just the
 * root layout's force-dynamic export changes nothing without this).
 *
 * This component instead resolves the session with Clerk's client SDK
 * (useUser()) after the page has already loaded as static HTML — the
 * tradeoff is a brief loading-skeleton flash before hydration, reusing
 * SiteHeader's own skeleton so both headers look identical while resolving.
 *
 * Deliberately does not mirror the DB Profile's avatarUrl/community list —
 * pulling those would need its own server round trip, undoing the point of
 * this component. Falls back to Clerk's own imageUrl/name/publicMetadata
 * instead (role/tier already live there — see lib/clerk-admin.ts, they're
 * the upstream source lib/clerk-sync.ts copies into our own User table, not
 * a derived copy, so reading them client-side here isn't stale). No
 * HeaderSearchRow either — that's community-browsing UI with no purpose on
 * a marketing page.
 */
export function MarketingHeader() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return <SiteHeaderSkeleton />;
  }

  const publicMetadata = user?.publicMetadata as { role?: string } | undefined;
  const isAdmin = publicMetadata?.role === "admin";
  const canModerate = isAdmin || publicMetadata?.role === "moderator";
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Member";

  return (
    <ScrollHeader>
      <Link href="/" className="flex flex-shrink-0 items-center gap-[.65rem]">
        <Image
          src="/images/nasihalogo-cropped.png"
          alt="NASIHA"
          width={296}
          height={334}
          priority
          className="h-9 w-auto shrink-0"
        />
        <span className="flex flex-col leading-none">
          <span className="text-xl font-black uppercase leading-none tracking-[.14em] text-logo">
            NASIHA
          </span>
          <span className="mt-[.2rem] hidden text-[.58rem] uppercase tracking-[.09em] text-muted-foreground sm:block">
            Knowledge · Community · Growth
          </span>
        </span>
      </Link>
      <DesktopNavLinks signedIn={Boolean(isSignedIn)} />
      <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
        {isSignedIn ? (
          <>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="What's New" title="What's New" asChild>
              <Link href="/whats-new">
                <Rss className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Dashboard" title="Dashboard" asChild>
              <Link href="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            </Button>
            {isAdmin && (
              <div className="hidden lg:block">
                <AdminReviewIcon />
              </div>
            )}
            <NotificationBell />
            <UserMenu name={name} avatarUrl={user?.imageUrl ?? null} />
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="px-2 text-sm font-semibold sm:px-3 sm:text-base" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" className="px-3 text-sm sm:text-base" asChild>
              <Link href="/join">
                <span className="sm:hidden">Join</span>
                <span className="hidden sm:inline">Join NASIHA</span>
              </Link>
            </Button>
          </>
        )}
        <MobileNav signedIn={Boolean(isSignedIn)} isAdmin={isAdmin} canModerate={Boolean(canModerate)} />
      </div>
    </ScrollHeader>
  );
}
