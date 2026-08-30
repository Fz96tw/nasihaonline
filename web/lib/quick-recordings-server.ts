import "server-only";
import { db } from "@/lib/db";
import {
  MeetingPlatform,
  MeetingRequestOrigin,
  MeetingRequestStatus,
  RecordingOwnerType,
} from "@/lib/generated/prisma/enums";
import type { MeetingRequestModel } from "@/lib/generated/prisma/models/MeetingRequest";
import { formatTimestamp } from "@/lib/format-date";
import { createLiveKitRoom, getRoomMetadata, updateRoomMetadata } from "@/lib/livekit";
import { stopEgress } from "@/lib/livekit-egress";

export class QuickRecordingError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
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

// ===== Shared video-sharing infrastructure =====
// The one mechanism every comment/message surface (forum, inbox, peer
// review) plugs into to embed a shared quick recording — see
// RecordingOwnerType's schema doc comment. Deliberately just the mechanism:
// wiring an actual "insert a shared video" composer into forum posts/inbox
// messages/review comments is each surface's own objective, not this file's.

/** Which nullable FK column on MeetingRequestRecording backs each ownerType — mirrors pasted-images-server.ts's OWNER_ID_FIELD. */
const RECORDING_OWNER_ID_FIELD: Record<RecordingOwnerType, "forumPostId" | "inboxMessageId" | "reviewCommentId"> = {
  [RecordingOwnerType.forum_post]: "forumPostId",
  [RecordingOwnerType.inbox_message]: "inboxMessageId",
  [RecordingOwnerType.review_comment]: "reviewCommentId",
};

/** Every nullable-FK column cleared at once — used whenever a recording is unlinked or relinked to a different owner. */
const CLEARED_OWNER_FIELDS = { ownerType: null, forumPostId: null, inboxMessageId: null, reviewCommentId: null } as const;

// A shared-video token is a `![alt](url)` markdown-image-shaped token (same
// convention PastedImage tokens use) whose url points at the existing
// recording-proxy route — see lib/linkify.tsx's VIDEO_PROXY_PREFIXES, which
// this must stay in sync with (that file renders it, this file authorizes
// linking it).
const SHARED_VIDEO_TOKEN_PATTERN = /!\[[^\]]*\]\(([^\s()]+)\)/g;
const RECORDING_PROXY_URL_PATTERN = /^\/api\/inbox\/meeting-requests\/([^/?#]+)\/recording\/([^/?#]+)$/;

function extractSharedRecordingTargets(body: string): { meetingRequestId: string; recordingId: string }[] {
  const targets: { meetingRequestId: string; recordingId: string }[] = [];
  const seen = new Set<string>();
  SHARED_VIDEO_TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SHARED_VIDEO_TOKEN_PATTERN.exec(body)) !== null) {
    const urlMatch = RECORDING_PROXY_URL_PATTERN.exec(match[1]);
    if (!urlMatch) continue;
    const [, meetingRequestId, recordingId] = urlMatch;
    if (seen.has(recordingId)) continue;
    seen.add(recordingId);
    targets.push({ meetingRequestId, recordingId });
  }
  return targets;
}

/**
 * Reconciles a MeetingRequestRecording's link against a just-saved
 * post/message/comment body — mirrors linkPastedImages's call-site pattern
 * (call again on every edit; it figures out what changed). At most one
 * shared video per body for v1: a second distinct video token is rejected
 * outright rather than silently picking one, since a composer that lets
 * someone attach two isn't supposed to exist yet.
 *
 * Only the recording's own owner (the quick recording's sender — always
 * true self/self creator, see createQuickRecordingMeetingRequest) may link
 * it, and only a `quick_recording`-origin recording can be shared at all
 * (a real 1:1 meeting's recording is out of scope). Linking automatically
 * supersedes whatever this owner/post previously had linked, and — if the
 * previously-linked recording differs from the new target — unlinks that
 * old one back to unshared (not deleted; still reusable via the video
 * library).
 */
export async function linkSharedRecording(params: {
  ownerType: RecordingOwnerType;
  ownerId: string;
  body: string;
  uploaderId: string;
}): Promise<void> {
  const { ownerType, ownerId, body, uploaderId } = params;
  const idField = RECORDING_OWNER_ID_FIELD[ownerType];

  const targets = extractSharedRecordingTargets(body);
  if (targets.length > 1) {
    throw new QuickRecordingError(400, "A post can reference at most one shared video.");
  }

  const currentlyLinked = await db.meetingRequestRecording.findFirst({
    where: { ownerType, [idField]: ownerId },
    select: { id: true },
  });

  const target = targets[0];
  if (!target) {
    if (currentlyLinked) {
      await db.meetingRequestRecording.update({ where: { id: currentlyLinked.id }, data: CLEARED_OWNER_FIELDS });
    }
    return;
  }
  // Already correctly linked — no-op (avoids an unnecessary write on every
  // re-save of an unchanged body).
  if (currentlyLinked?.id === target.recordingId) return;

  const recording = await db.meetingRequestRecording.findUnique({
    where: { id: target.recordingId },
    select: { id: true, meetingRequest: { select: { id: true, senderId: true, origin: true } } },
  });
  if (!recording || recording.meetingRequest.id !== target.meetingRequestId) {
    throw new QuickRecordingError(404, "That video couldn't be found.");
  }
  if (recording.meetingRequest.senderId !== uploaderId) {
    throw new QuickRecordingError(403, "You can only share a recording you made yourself.");
  }
  if (recording.meetingRequest.origin !== MeetingRequestOrigin.quick_recording) {
    throw new QuickRecordingError(400, "Only a quick recording can be shared this way.");
  }

  if (currentlyLinked) {
    await db.meetingRequestRecording.update({ where: { id: currentlyLinked.id }, data: CLEARED_OWNER_FIELDS });
  }
  await db.meetingRequestRecording.update({
    where: { id: recording.id },
    data: { ...CLEARED_OWNER_FIELDS, ownerType, [idField]: ownerId },
  });
}

/**
 * Unlinks (never deletes) whatever recording is currently linked to any of
 * `ownerIds` — called when the owning post/message/comment is itself
 * hard-deleted (today: only deleteReviewItem, via its comments' ids; forum
 * posts/inbox messages have no hard-delete path yet, same "no caller needs
 * this yet" situation unlinkAndDeleteAllPastedImages documents in
 * lib/pasted-images-server.ts). A no-op FK/ownerType clear, not a delete —
 * the recording and its file survive for reuse via the video library.
 */
export async function unlinkSharedRecordings(ownerType: RecordingOwnerType, ownerIds: string[]): Promise<void> {
  if (ownerIds.length === 0) return;
  const idField = RECORDING_OWNER_ID_FIELD[ownerType];
  await db.meetingRequestRecording.updateMany({
    where: { ownerType, [idField]: { in: ownerIds } },
    data: CLEARED_OWNER_FIELDS,
  });
}
