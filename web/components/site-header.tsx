import Image from "next/image";
import Link from "next/link";
import { LayoutDashboard, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AdminReviewIcon } from "@/components/admin/admin-review-icon";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { ScrollHeader } from "@/components/scroll-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DesktopNavLinks } from "@/components/desktop-nav-links";
import { HeaderSearchRow } from "@/components/header-search-row";
import { SearchQueryProvider } from "@/components/header-search-context";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";

// Placeholder shown while SiteHeader resolves the session/profile lookup —
// keeps the layout's Suspense boundary from blocking every page's initial
// HTML on that lookup. State-agnostic (doesn't guess signed-in vs guest).
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

export async function SiteHeader() {
  const user = await getSessionUser();
  const profile = user ? withResolvedAvatarUrl(await getOrCreateProfile(user.id)) : null;

  return (
    <SearchQueryProvider>
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
        <DesktopNavLinks signedIn={Boolean(user)} />
        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden">
          {user ? (
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
              {user.role === "admin" && (
                <div className="hidden lg:block">
                  <AdminReviewIcon />
                </div>
              )}
              <NotificationBell />
              <UserMenu name={user.name ?? user.email} avatarUrl={profile?.avatarUrl ?? null} />
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
          <MobileNav
            signedIn={Boolean(user)}
            isAdmin={user?.role === "admin"}
            canModerate={user?.role === "moderator" || user?.role === "admin"}
          />
        </div>
      </ScrollHeader>
      {user && <HeaderSearchRow />}
    </SearchQueryProvider>
  );
}
