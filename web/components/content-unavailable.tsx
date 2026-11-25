import Link from "next/link";
import { Lock, SearchX } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { SignInToViewLink } from "@/components/sign-in-to-view-link";

/**
 * Body of the segment-scoped not-found.tsx for content that can be shared
 * privately (Library items, forum threads, peer review items), so a link from
 * an invite doesn't dead-end on a bare 404. The response is still a 404, and
 * the message never depends on whether the id exists or is restricted — the
 * same "don't confirm a private item exists" rule as before:
 *
 * - Signed out: "Sign in to view", returning here after sign-in, plus an
 *   "Apply to join" link for non-members. (Public content never reaches this,
 *   so for a signed-out visitor "not found" usually means "members only".)
 * - Signed in: "isn't available", with a way back to the section.
 */
export async function ContentUnavailable({
  noun,
  sectionHref,
  sectionLabel,
}: {
  /** e.g. "resource", "discussion", "peer review item". */
  noun: string;
  sectionHref: string;
  /** e.g. "Knowledge Library". */
  sectionLabel: string;
}) {
  const user = await getSessionUser();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:p-8">
      {user && <BackLink fallbackHref={sectionHref} />}

      <div className="flex flex-col items-center gap-3 rounded-[10px] border px-6 py-10 text-center sm:p-12">
        {user ? (
          <>
            <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-lg font-medium">This {noun} isn&apos;t available</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              It may have been removed, or it&apos;s only shared with specific members. If someone shared it with
              you, ask them to check that you&apos;re invited.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href={sectionHref}>Go to {sectionLabel}</Link>
            </Button>
          </>
        ) : (
          <>
            <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-lg font-medium">Sign in to view this {noun}</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              This {noun} is only available to NASIHA members. If it was shared with you, sign in and you&apos;ll come
              straight back here.
            </p>
            <SignInToViewLink />
            <p className="text-sm text-muted-foreground">
              Not a member yet?{" "}
              <Link href="/join" className="font-medium text-primary hover:underline">
                Apply to join
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
