import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAdmissionPhase } from "@/lib/settings";
import { ADMISSION_PHASE_LABELS } from "@/lib/admission-phase";

export default async function Home() {
  const phase = await getAdmissionPhase();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Nasiha</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Foundational scaffold — Next.js, Tailwind, and shadcn/ui are wired up.
      </p>
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
        Current Phase: {ADMISSION_PHASE_LABELS[phase]}
      </span>
      <Button asChild>
        <Link href="/join">Apply for Membership</Link>
      </Button>
    </main>
  );
}
