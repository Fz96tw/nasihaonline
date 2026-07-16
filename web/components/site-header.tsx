import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { MobileNav } from "@/components/mobile-nav";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";

export async function SiteHeader() {
  const user = await getSessionUser();
  const profile = user ? withResolvedAvatarUrl(await getOrCreateProfile(user.id)) : null;

  return (
    <header className="sticky top-0 z-50 flex h-[62px] items-center gap-6 border-b bg-background px-4 shadow-sm lg:px-8">
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
          <span className="text-xl font-black uppercase leading-none tracking-[.14em] text-primary">
            NASIHA
          </span>
          <span className="mt-[.2rem] hidden text-[.58rem] uppercase tracking-[.09em] text-muted-foreground sm:block">
            Knowledge · Community · Growth
          </span>
        </span>
      </Link>
      <div className="hidden items-center gap-6 lg:flex">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/about">About</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/our-team">Our Team</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/events">Events</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/blog">Blog</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/donate">Donate</Link>
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {user ? (
          <>
            <div className="hidden items-center gap-2 lg:flex">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/members">Members</Link>
              </Button>
            </div>
            <NotificationBell />
            <UserMenu name={user.name ?? user.email} avatarUrl={profile?.avatarUrl ?? null} />
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="hidden lg:inline-flex" asChild>
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/join">Join NASIHA</Link>
            </Button>
          </>
        )}
        <MobileNav
          signedIn={Boolean(user)}
          isAdmin={user?.role === "admin"}
          canModerate={user?.role === "moderator" || user?.role === "admin"}
        />
      </div>
    </header>
  );
}
