import "server-only";
import { db } from "@/lib/db";
import { MeetingPlatform, MeetingRequestOrigin, MeetingRequestStatus } from "@/lib/generated/prisma/enums";
import type { MeetingRequestModel } from "@/lib/generated/prisma/models/MeetingRequest";
import { formatTimestamp } from "@/lib/format-date";
import { createLiveKitRoom, getRoomMetadata, updateRoomMetadata } from "@/lib/livekit";
import { stopEgress } from "@/lib/livekit-egress";

export class QuickRecordingError extends Error {
  constructor(
    public readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Creates a solo self/self MeetingRequest backing a one-click quick
 * recording (Quick Video Recording & Sharing initiative) — created
 * directly here, not via createMeetingRequest/resolveMeetingRequest, since
 * those post ContributionLedger rows and send a Notification/email that
 * only make sense for a real two-party negotiation. `status: accepted` and
 * `meetingStartedAt: now` so the existing meeting-request token/status/
 * recording endpoints (which gate on "started") treat this as already live
 * — no separate "Start Meeting" click. `origin: quick_recording` is what
 * every other meeting-request list query filters out (getInboxList,
 * getMyMeetingRequests, getUpcomingMeetingsForUser, getPastMeetingsForUser).
 */
export async function createQuickRecordingMeetingRequest(
  userId: string,
  topic?: string,
): Promise<MeetingRequestModel> {
  const resolvedTopic = topic?.trim() || `Quick recording — ${formatTimestamp(new Date().toISOString())}`;

  const meetingRequest = await db.meetingRequest.create({
    data: {
      senderId: userId,
      recipientId: userId,
      topic: resolvedTopic,
      status: MeetingRequestStatus.accepted,
      meetingPlatform: MeetingPlatform.livekit,
      origin: MeetingRequestOrigin.quick_recording,
      scheduledAt: new Date(),
      meetingStartedAt: new Date(),
    },
  });

  const livekitRoomName = await createLiveKitRoom(meetingRequest.id, resolvedTopic);
  if (!livekitRoomName) return meetingRequest;

  return db.meetingRequest.update({
    where: { id: meetingRequest.id },
    data: { livekitRoomName },
  });
}

async function getOwnQuickRecording(meetingRequestId: string, userId: string) {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: { id: true, senderId: true, origin: true, topic: true },
  });
  if (!meetingRequest || meetingRequest.origin !== MeetingRequestOrigin.quick_recording) {
    throw new QuickRecordingError(404, "Quick recording not found.");
  }
  // Always sender === recipient === creator (see createQuickRecordingMeetingRequest),
  // so this is the only access check a quick recording needs.
  if (meetingRequest.senderId !== userId) {
    throw new QuickRecordingError(403, "You don't have access to this recording.");
  }
  return meetingRequest;
}

/** Creator-only rename, used by both the "done" page and the dashboard list's rename action. */
export async function renameQuickRecording(meetingRequestId: string, userId: string, topic: string): Promise<void> {
  await getOwnQuickRecording(meetingRequestId, userId);
  await db.meetingRequest.update({ where: { id: meetingRequestId }, data: { topic: topic.trim() } });
}

export type QuickRecordingProcessingStatus = {
  topic: string;
  ready: boolean;
  failed: boolean;
  recordingId: string | null;
};

/**
 * Polled by the /meet/quick/[id]/done page while the egress_ended webhook
 * hasn't attached the recording yet. A quick recording is expected to
 * produce at most one MeetingRequestRecording segment (Record is clicked
 * once, auto-stops at the configured limit) — the most recently started
 * one is used if, unexpectedly, there's more than one.
 */
export async function getQuickRecordingProcessingStatus(
  meetingRequestId: string,
  userId: string,
): Promise<QuickRecordingProcessingStatus> {
  const meetingRequest = await getOwnQuickRecording(meetingRequestId, userId);
  const latest = await db.meetingRequestRecording.findFirst({
    where: { meetingRequestId },
    orderBy: { startedAt: "desc" },
    select: { id: true, objectKey: true, failedAt: true },
  });

  return {
    topic: meetingRequest.topic,
    ready: latest?.objectKey != null,
    failed: latest?.failedAt != null,
    recordingId: latest?.id ?? null,
  };
}

/**
 * Server-side backstop for the admin-configurable recording time limit —
 * the client-side countdown (LiveKitMeetingScreen) is the primary
 * enforcement, but an idle tab (screen-share still active, JS timer never
 * fires) must still get cut off. LiveKit's egress API has no native
 * max-duration option, so this schedules an in-process delayed stop
 * instead — safe because the app runs as a long-lived Docker process, not
 * serverless (a request handler returning doesn't kill the process).
 * Called from the recording/start route, only for a `quick_recording`-
 * origin MeetingRequest — regular scheduled meetings/events have no
 * duration cap.
 *
 * Guards against a since-stopped-and-restarted egress by re-checking the
 * room's live metadata before stopping: if `egressId` no longer matches
 * what's currently recording, this timer is stale and a no-op.
 */
export function scheduleQuickRecordingAutoStop(roomName: string, egressId: string, maxDurationSeconds: number): void {
  setTimeout(async () => {
    try {
      const current = await getRoomMetadata(roomName);
      if (!current?.recording || current.egressId !== egressId) return;
      await stopEgress(egressId);
      await updateRoomMetadata(roomName, { recording: false, egressId: null });
    } catch (error) {
      console.error(`[quick-recordings] Failed to auto-stop egress ${egressId} for room ${roomName}`, error);
    }
  }, maxDurationSeconds * 1000);
}
