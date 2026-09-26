import { BackLink } from "@/components/back-link";
import type { ReactNode } from "react";
import { PageHeading } from "@/components/page-heading";

/** Shared frame for the small text pages linked from the landing page footer. */
export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
      <BackLink />
      <PageHeading>{title}</PageHeading>
      {children}
    </main>
  );
}
