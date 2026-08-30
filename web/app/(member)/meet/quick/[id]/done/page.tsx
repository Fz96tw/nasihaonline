import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getQuickRecordingProcessingStatus, QuickRecordingError } from "@/lib/quick-recordings-server";
import { QuickRecordingDonePanel } from "@/components/calendar/quick-recording-done-panel";

export const metadata: Metadata = {
  title: "Quick Recording — NASIHA",
};

/**
 * Processing/done page for a quick recording (Quick Video Recording &
 * Sharing initiative) — reached after clicking Stop on
 * /meet/quick/[id] (see QuickRecordingMeetingScreen's onRecordingStopped).
 * Renders the initial status server-side, then hands off to a client panel
 * that polls until the egress_ended webhook attaches the recording.
 */
export default async function QuickRecordingDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  let status;
  try {
    status = await getQuickRecordingProcessingStatus(id, user.id);
  } catch (error) {
    // Both QuickRecordingError cases (404 not found, 403 not the creator)
    // render the same not-found page — no need to distinguish "doesn't
    // exist" from "isn't yours" to the viewer.
    if (error instanceof QuickRecordingError) notFound();
    throw error;
  }

  return <QuickRecordingDonePanel meetingRequestId={id} initialStatus={status} />;
}
