import { LandingForms } from "@/components/landing-forms";
import { RecentRecordings } from "@/components/recent-recordings";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-4 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Showup</h1>
        <p className="text-muted-foreground">
          Share your screen with anyone using just a code. Free, no account needed.
        </p>
      </header>
      <LandingForms />
      <RecentRecordings />
    </main>
  );
}
