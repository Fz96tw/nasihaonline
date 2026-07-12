import type { Metadata } from "next";
import { getAdmissionPhase } from "@/lib/settings";
import { JoinForm } from "@/components/join-form";

export const metadata: Metadata = {
  title: "Apply to Join — Nasiha",
};

export default async function JoinPage() {
  const phase = await getAdmissionPhase();

  return (
    <main className="min-h-screen">
      <JoinForm phase={phase} />
    </main>
  );
}
