import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { DonateForm } from "@/components/donate-form";

export const metadata: Metadata = {
  title: "Donate — NASIHA",
};

/**
 * Public, unauthenticated (PRD §4.14 AC1) — getSessionUser() is only used
 * to prefill name/email for a signed-in visitor, never to gate access.
 */
export default async function DonatePage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const user = await getSessionUser();

  if (searchParams.success) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Thank you!</h1>
        <p className="max-w-md text-muted-foreground">
          Your donation is being processed. You&rsquo;ll receive a receipt from Stripe by email
          shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <DonateForm
        defaultName={user?.name ?? undefined}
        defaultEmail={user?.email ?? undefined}
        canceled={Boolean(searchParams.canceled)}
      />
    </main>
  );
}
