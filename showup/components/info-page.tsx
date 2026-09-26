import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** Shared frame for the small text pages linked from the landing page footer. */
export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
      <Link href="/" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Showup
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}
