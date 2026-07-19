import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getInboxList } from "@/lib/inbox-server";
import { InboxPanel } from "@/components/inbox/inbox-panel";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

export const metadata: Metadata = {
  title: "Message Inbox — NASIHA",
};

export default async function InboxPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const items = await getInboxList(user.id);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/inbox.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.65)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Message Inbox</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Asynchronous messages and meeting requests from fellow members — no live chat.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-16">
        <Suspense fallback={null}>
          <InboxPanel initialItems={items} />
        </Suspense>
      </section>
    </main>
  );
}
