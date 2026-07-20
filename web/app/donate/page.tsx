import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { DonateForm } from "@/components/donate-form";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

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
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/donate2.jpg" priority objectPosition="object-[center_45%]" />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Support Us</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Donations fund the Organization directly and are entirely separate from the Knowledge Hours exchange.
          </p>
        </div>
      </section>

      <DonateForm
        defaultName={user?.name ?? undefined}
        defaultEmail={user?.email ?? undefined}
        canceled={Boolean(searchParams.canceled)}
        showHeader={false}
      />
    </main>
  );
}
