import Link from "next/link";
import { Logo } from "@/components/logo";
import { LandingForms } from "@/components/landing-forms";
import { RecentRecordings } from "@/components/recent-recordings";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        {/* The logo sits on the title's baseline and is as tall as the title's font size, taller than its capital letters. */}
        <div className="flex items-baseline gap-3 text-[3.4rem] leading-none sm:gap-4 sm:text-[4.25rem]">
          <Logo className="h-[1em] w-auto shrink-0" />
          <h1 className="font-bold tracking-tight text-purple-600">
            Show
            {/* "UP" rises above the line and fades, like the presenter ghost stepping up out of the screen. */}
            <span className="-ml-[0.4em] inline-block -translate-y-[0.03em] opacity-50 [text-shadow:0_0_0.35em_rgb(168_85_247_/_0.85)]">UP</span>
          </h1>
        </div>
        <p className="text-balance text-lg font-medium">Show up. Share your screen. Step in.</p>
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
