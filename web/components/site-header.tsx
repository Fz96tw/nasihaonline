import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { getSessionUser } from "@/lib/auth";

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-50 flex h-[62px] items-center gap-6 border-b bg-background px-4 shadow-sm md:px-8">
      <Link href="/" className="flex flex-shrink-0 items-center gap-[.65rem]">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-primary">
          <span className="text-lg font-black italic tracking-[-.05em] text-primary-foreground">
            N
          </span>
          <span className="absolute bottom-0 right-0 h-[3px] w-4 rounded-tl-sm bg-primary-foreground/40" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-xl font-black uppercase leading-none tracking-[.14em] text-primary">
            Nasiha
          </span>
          <span className="mt-[.2rem] hidden text-[.58rem] uppercase tracking-[.09em] text-muted-foreground sm:block">
            Knowledge · Community · Growth
          </span>
        </span>
      </Link>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/our-team">Our Team</Link>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/donate">Donate</Link>
      </Button>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {user ? (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings">Settings</Link>
            </Button>
            <UserMenu />
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/join">Join NASIHA</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
