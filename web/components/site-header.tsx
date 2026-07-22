import Image from "next/image";
import Link from "next/link";
import { Lock, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NavDropdown } from "@/components/nav-dropdown";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AdminReviewIcon } from "@/components/admin/admin-review-icon";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { ScrollHeader } from "@/components/scroll-header";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const user = await getSessionUser();
  const profile = user ? withResolvedAvatarUrl(await getOrCreateProfile(user.id)) : null;

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
      <div className="hidden items-center gap-3 self-stretch lg:flex">
        <NavDropdown label="Our Mission">
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/about">About</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/getinvolved">Get Involved</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/our-team">Our Team</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/contact">Contact Us</Link>
          </DropdownMenuItem>
        </NavDropdown>
        <NavDropdown label="Community">
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/events">Events</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/blog">Blogs</Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/library" className={cn("justify-between", !user && "text-muted-foreground")}>
              Knowledge Library
              {!user && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />
              )}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/forums" className={cn("justify-between", !user && "text-muted-foreground")}>
              Forums
              {!user && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />
              )}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/members" className={cn("justify-between", !user && "text-muted-foreground")}>
              Member Directory
              {!user && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />
              )}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-base" asChild>
            <Link href="/inbox" className={cn("justify-between", !user && "text-muted-foreground")}>
              Message Inbox
              {!user && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sign-in required" />
              )}
            </Link>
          </DropdownMenuItem>
        </NavDropdown>
        <Button variant="ghost" size="sm" className="text-base font-semibold" asChild>
          <Link href="/donate">Support Us</Link>
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {user ? (
          <>
            <div className="hidden items-center gap-2 lg:flex">
              <Button variant="ghost" size="sm" className="text-base font-semibold" asChild>
                <Link href="/whats-new">What&apos;s New</Link>
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="What's New" asChild>
              <Link href="/whats-new">
                <Rss className="h-[18px] w-[18px]" />
              </Link>
            </Button>
            {user.role === "admin" && <AdminReviewIcon />}
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
  );
}
