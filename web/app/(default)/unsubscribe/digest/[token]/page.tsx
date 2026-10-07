import type { Metadata } from "next";
import { db } from "@/lib/db";
import { UnsubscribeDigestButton } from "@/components/unsubscribe-digest-button";

export const metadata: Metadata = {
  title: "Unsubscribe from weekly updates",
  robots: { index: false, follow: false },
};

/**
 * Public landing page for the unsubscribe link in the weekly-digest teaser
 * email. No login: the token in the URL is the credential, and nothing about
 * the member (name, email) is shown. Unsubscribing is a button press rather
 * than a bare GET so mail-client link scanners that prefetch URLs can't
 * unsubscribe someone by accident.
 */
export default async function UnsubscribeDigestPage({ params }: { params: { token: string } }) {
  const user = await db.user.findUnique({
    where: { digestUnsubscribeToken: params.token },
    select: { digestEmailOptedOut: true },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Weekly updates</h1>
      {!user ? (
        <p className="text-muted-foreground">This unsubscribe link isn&apos;t valid or has expired.</p>
      ) : user.digestEmailOptedOut ? (
        <p className="text-muted-foreground">You&apos;re unsubscribed — you won&apos;t get these emails anymore.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Stop receiving the occasional email summarizing what&apos;s happening at NASIHA?
          </p>
          <UnsubscribeDigestButton token={params.token} />
        </>
      )}
    </main>
  );
}
