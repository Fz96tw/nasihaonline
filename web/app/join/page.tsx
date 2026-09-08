import type { Metadata } from "next";
import { getAdmissionPhase } from "@/lib/settings";
import { JoinForm } from "@/components/join-form";
import { TierPreviewStrip } from "@/components/join/tier-preview-strip";

export const metadata: Metadata = {
  title: "Apply to Join",
  description:
    "Apply to join NASIHA, a member-driven community for professionals who want to share knowledge, teach, and exchange peer feedback.",
  alternates: { canonical: "/join" },
};

export default async function JoinPage() {
  const phase = await getAdmissionPhase();

  return (
    <main className="min-h-screen">
      <TierPreviewStrip />
      <JoinForm phase={phase} />
    </main>
  );
}
