import type { Metadata } from "next";
import { getAdmissionPhase } from "@/lib/settings";
import { JoinForm } from "@/components/join-form";
import { TierPreviewStrip } from "@/components/join/tier-preview-strip";
import { buildMetadata } from "@/lib/seo";
import { getGuestJoinPrefill } from "@/lib/guest-membership";

export const metadata: Metadata = buildMetadata({
  title: "Apply to Join",
  description:
    "Apply to join NASIHA, a member-driven community for professionals who want to share knowledge, teach, and exchange peer feedback.",
  path: "/join",
});

// getAdmissionPhase() gates whether this page shows the open sign-up form
// or a closed/waitlist state — real, business-meaningful content. Freezing
// it at build time (Docker build has no DB access, so it'd also fall back
// to a default admission phase rather than the real one) risks showing
// the wrong state to visitors until the next deploy. Kept out of
// app/(marketing)'s static win (objective 4) for that reason.
export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ gi?: string }> }) {
  const phase = await getAdmissionPhase();
  // An event guest's apply-to-join link (/join?gi=<their registration id>) —
  // prefills them and carries the referral; anything unknown or revoked
  // just shows the normal empty form.
  const { gi } = await searchParams;
  const guestPrefill = gi ? await getGuestJoinPrefill(gi) : null;

  return (
    <main className="min-h-screen">
      <TierPreviewStrip />
      <JoinForm phase={phase} guestPrefill={guestPrefill} guestInvite={guestPrefill ? gi : undefined} />
    </main>
  );
}
