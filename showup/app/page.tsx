import { LandingForms } from "@/components/landing-forms";
import { RecentRecordings } from "@/components/recent-recordings";

const NASIHA_URL = "https://nasihaforyou.org";

const STEPS = [
  { title: "Start with a code", body: "Pick any code you like (or tap Random) and share your screen." },
  { title: "Share the code", body: "Send the code to whoever should join. There are no accounts and no invites." },
  { title: "Guests join", body: "They enter the code and their name, and see your screen. Guests can ask to appear on it too." },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:py-14">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Showup</h1>
        <p className="text-balance text-lg font-medium">Show up. Share your screen. Appear on it.</p>
        <p className="text-muted-foreground">Share your screen with anyone using just a code. Free, no account needed.</p>
      </header>

      <LandingForms />

      <section aria-labelledby="how-it-works" className="flex flex-col gap-4">
        <h2 id="how-it-works" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-1 rounded-xl border border-border p-4">
              <span className="text-sm font-semibold text-primary">Step {index + 1}</span>
              <span className="font-medium">{step.title}</span>
              <span className="text-sm text-muted-foreground">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="browser-support" className="flex flex-col gap-2">
        <h2 id="browser-support" className="text-xl font-semibold">
          Browser support
        </h2>
        <p className="text-sm text-muted-foreground" data-testid="browser-support">
          The webcam overlay (showing yourself over your shared screen) works in Chrome and Edge on a computer only. Every other browser can
          still join and watch, and sharing a screen works in most desktop browsers, though not on phones.
        </p>
      </section>

      <section aria-labelledby="privacy" className="flex flex-col gap-2">
        <h2 id="privacy" className="text-xl font-semibold">
          Privacy and recording
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="privacy-disclosure">
          <li>There are no accounts. Anyone who has a code can join, so share it only with people you want there.</li>
          <li>Hosts can record their meeting. While it records, everyone in the meeting sees a red &ldquo;This meeting is being recorded&rdquo; banner.</li>
          <li>Recordings are deleted after 7 days.</li>
          <li>The webcam overlay is put together in the presenter&rsquo;s own browser, not on a server.</li>
        </ul>
      </section>

      <RecentRecordings />

      <footer className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
        From the makers of{" "}
        <a href={NASIHA_URL} className="font-medium underline underline-offset-2 hover:text-foreground">
          Nasiha
        </a>
      </footer>
    </main>
  );
}
