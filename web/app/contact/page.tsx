import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { ContactForm } from "@/components/contact-form";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

export const metadata: Metadata = {
  title: "Contact — NASIHA",
};

/**
 * Public, unauthenticated — getSessionUser() is only used to prefill
 * name/email for a signed-in visitor, never to gate access.
 */
export default async function ContactPage() {
  const user = await getSessionUser();

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/contact.jpg" priority objectPosition="object-[center_60%]" />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Contact Us</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Questions, feedback, or partnership inquiries — we&rsquo;d love to hear from you.
          </p>
        </div>
      </section>

      <ContactForm
        defaultName={user?.name ?? undefined}
        defaultEmail={user?.email ?? undefined}
        showHeader={false}
      />
    </main>
  );
}
