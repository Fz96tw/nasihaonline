import type { Metadata } from "next";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { GetInvolvedTabs } from "@/components/getinvolved/get-involved-tabs";
import { getAdmissionPhase } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Get Involved — NASIHA",
};

export default async function GetInvolvedPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string };
}) {
  const [phase, user] = await Promise.all([getAdmissionPhase(), getSessionUser()]);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-20 text-center text-primary-foreground">
        <ParallaxHeroImage
          src="/images/getinvolved-new.jpg"
          priority
          objectPosition="object-[center_70%]"
        />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.65)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-4 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">
            Get Involved
          </h1>
          <p className="text-lg leading-[1.7] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)]">
            Join a community built on reciprocal knowledge exchange — learn how the
            model works and how every contribution earns its return.
          </p>
        </div>
      </section>

      <GetInvolvedTabs
        phase={phase}
        defaultName={user?.name ?? undefined}
        defaultEmail={user?.email ?? undefined}
        success={Boolean(searchParams.success)}
        canceled={Boolean(searchParams.canceled)}
      />
    </main>
  );
}
