"use client";

import { useRouter } from "next/navigation";
import { LiveKitMeetingScreen } from "@/components/calendar/livekit-meeting-screen";

/**
 * Thin client wrapper around LiveKitMeetingScreen for a quick recording
 * (Quick Video Recording & Sharing initiative) — deliberately bypasses
 * MeetingWaitingRoom entirely (unlike kind "event"/"request" in
 * app/(member)/meet/[kind]/[id]/page.tsx), since a quick recording's
 * creator is always its sole organizer with nothing to wait for. Supplies
 * the one behavior generic to every other LiveKitMeetingScreen caller:
 * navigating to the processing/done page once recording stops (manually
 * or via the countdown auto-stop), rather than staying on the live call.
 */
export function QuickRecordingMeetingScreen({
  tokenEndpoint,
  recordingStartEndpoint,
  recordingStopEndpoint,
  chatEndpoint,
  title,
  organizerName,
  maxRecordingSeconds,
  doneHref,
  backHref,
}: {
  tokenEndpoint: string;
  recordingStartEndpoint: string;
  recordingStopEndpoint: string;
  chatEndpoint: string;
  title: string;
  organizerName: string;
  maxRecordingSeconds: number;
  doneHref: string;
  backHref: string;
}) {
  const router = useRouter();

  return (
    <LiveKitMeetingScreen
      tokenEndpoint={tokenEndpoint}
      recordingStartEndpoint={recordingStartEndpoint}
      recordingStopEndpoint={recordingStopEndpoint}
      chatEndpoint={chatEndpoint}
      title={title}
      organizerName={organizerName}
      // Solo self/self call — the creator is always both host and the only
      // other "participant" in LiveKit terms, same unrestricted-recording
      // policy MeetingRequest already gives both parties (see
      // meeting-waiting-room.tsx's isHostOrCoHost default).
      isHostOrCoHost
      canKick={false}
      backHref={backHref}
      maxRecordingSeconds={maxRecordingSeconds}
      onRecordingStopped={() => router.push(doneHref)}
    />
  );
}
