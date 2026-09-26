import Link from "next/link";
import { Logo } from "@/components/logo";
import { LandingForms } from "@/components/landing-forms";
import { RecentRecordings } from "@/components/recent-recordings";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:py-14">
      <header className="flex flex-col items-center gap-4 text-center">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5 sm:text-left">
          {/* On wider screens the mark is as tall as the title and tagline (74px), so it sits flush with them. */}
          <Logo className="h-20 w-auto sm:h-[4.625rem]" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-4xl font-bold tracking-tight text-purple-500">Showup</h1>
            <p className="text-balance text-lg font-medium">Show up. Share your screen. Step into it.</p>
          </div>
        </div>
        <p className="text-muted-foreground">Share your screen with anyone using just a code. Free, no account needed.</p>
      </header>

      <LandingForms />

      <RecentRecordings />

      <footer className="flex flex-col items-center gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
        <nav aria-label="More about Showup" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href="/how-it-works" className="underline underline-offset-2 hover:text-foreground">
            How it works
          </Link>
          <Link href="/browser-support" className="underline underline-offset-2 hover:text-foreground">
            Browser support
          </Link>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy and recording
          </Link>
        </nav>
      </footer>
    </main>
  );
}
