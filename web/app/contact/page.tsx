import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { ContactForm } from "@/components/contact-form";

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
      <ContactForm defaultName={user?.name ?? undefined} defaultEmail={user?.email ?? undefined} />
    </main>
  );
}
