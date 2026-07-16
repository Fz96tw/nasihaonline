import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { EVENT_SUBMISSION_TIERS } from "@/lib/events";
import { SubmitEventForm } from "@/components/calendar/submit-event-form";

export const metadata: Metadata = {
  title: "Submit Event — NASIHA",
};

// Gated to EVENT_SUBMISSION_TIERS (§4.6, §11 open question #2) — a member
// below the gated tier is redirected back to /calendar rather than seeing
// the form; POST /api/events enforces the same gate server-side via
// requireTier() regardless of how this page is reached.
export default async function NewEventPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!user.tier || !EVENT_SUBMISSION_TIERS.includes(user.tier)) redirect("/calendar");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Event</h1>
        <p className="text-muted-foreground">
          Create a new event for the community calendar. You&apos;ll be listed as the host.
        </p>
      </div>

      <SubmitEventForm />
    </main>
  );
}
