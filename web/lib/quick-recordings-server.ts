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
import { deleteRecordingObject } from "@/lib/recordings-storage";

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

// ===== Video library =====
// Browsing/reusing/managing a member's own past quick recordings — builds
// directly on the shared video-sharing infrastructure above (ownerType/FK
// columns, RECORDING_OWNER_ID_FIELD) to resolve where a recording is
// currently shared, if anywhere.

export type SharedRecordingLink = { label: string; href: string };

/**
 * Resolves a human-readable "where is this shared" label/link — dispatches
 * on ownerType exactly the way canViewSharedRecording (lib/meeting-requests-
 * server.ts) does for authorization, but for display instead of an access
 * check. `ownerId` is the recording's own owner (the quick recording's
 * sender) — needed only to pick "the other participant" for inbox_message,
 * since an inbox message's own sender/recipient columns don't say which
 * side is the video's uploader.
 */
async function resolveSharedRecordingLink(
  recording: {
    ownerType: RecordingOwnerType | null;
    forumPostId: string | null;
    inboxMessageId: string | null;
    reviewCommentId: string | null;
  },
  ownerId: string,
): Promise<SharedRecordingLink | null> {
  if (!recording.ownerType) return null;

  if (recording.ownerType === RecordingOwnerType.forum_post && recording.forumPostId) {
    const post = await db.forumPost.findUnique({
      where: { id: recording.forumPostId },
      select: { threadId: true, thread: { select: { title: true, forum: { select: { slug: true } } } } },
    });
    if (!post) return null;
    return {
      label: `Shared in forum thread: ${post.thread.title}`,
      href: `/forums/${post.thread.forum.slug}/${post.threadId}#post-${recording.forumPostId}`,
    };
  }

  if (recording.ownerType === RecordingOwnerType.inbox_message && recording.inboxMessageId) {
    const message = await db.inboxMessage.findUnique({
      where: { id: recording.inboxMessageId },
      select: {
        senderId: true,
        sender: { select: { name: true } },
        recipientId: true,
        recipient: { select: { name: true } },
      },
    });
    if (!message) return null;
    const otherParty = message.senderId === ownerId ? message.recipient : message.sender;
    return {
      label: `Shared in a message to ${otherParty.name ?? "a member"}`,
      href: `/inbox?item=${recording.inboxMessageId}`,
    };
  }

  if (recording.ownerType === RecordingOwnerType.review_comment && recording.reviewCommentId) {
    const comment = await db.reviewComment.findUnique({
      where: { id: recording.reviewCommentId },
      select: { reviewItem: { select: { id: true, title: true } } },
    });
    if (!comment) return null;
    return {
      label: `Shared in peer review: ${comment.reviewItem.title}`,
      href: `/review-feedback/${comment.reviewItem.id}#comment-${recording.reviewCommentId}`,
    };
  }

  return null;
}

export type QuickRecordingListItem = {
  /** MeetingRequestRecording id — what /api/quick-recordings/[id]/... routes key on for playback, but rename/delete key on meetingRequestId (see below), matching the create/rename/status routes' existing convention. */
  id: string;
  meetingRequestId: string;
  topic: string;
  createdAt: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  ready: boolean;
  failed: boolean;
  shared: SharedRecordingLink | null;
};

const RECORDING_LIST_SELECT = {
  id: true,
  meetingRequestId: true,
  objectKey: true,
  failedAt: true,
  durationSeconds: true,
  sizeBytes: true,
  createdAt: true,
  ownerType: true,
  forumPostId: true,
  inboxMessageId: true,
  reviewCommentId: true,
  meetingRequest: { select: { topic: true, senderId: true } },
} as const;

type RecordingListRow = {
  id: string;
  meetingRequestId: string;
  objectKey: string | null;
  failedAt: Date | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  createdAt: Date;
  ownerType: RecordingOwnerType | null;
  forumPostId: string | null;
  inboxMessageId: string | null;
  reviewCommentId: string | null;
  meetingRequest: { topic: string; senderId: string };
};

async function toQuickRecordingListItems(rows: RecordingListRow[]): Promise<QuickRecordingListItem[]> {
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      meetingRequestId: row.meetingRequestId,
      topic: row.meetingRequest.topic,
      createdAt: row.createdAt.toISOString(),
      durationSeconds: row.durationSeconds,
      sizeBytes: row.sizeBytes,
      ready: row.objectKey !== null,
      failed: row.failedAt !== null,
      shared: await resolveSharedRecordingLink(row, row.meetingRequest.senderId),
    })),
  );
}

/**
 * GET /api/quick-recordings — ready-only (per its own doc comment: a
 * "record a new video instead"-or-"pick an existing one" picker has nothing
 * useful to do with a still-processing or failed recording). Newest first.
 */
export async function getReadyQuickRecordingsForUser(userId: string): Promise<QuickRecordingListItem[]> {
  const rows = await db.meetingRequestRecording.findMany({
    where: {
      meetingRequest: { senderId: userId, origin: MeetingRequestOrigin.quick_recording },
      objectKey: { not: null },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: RECORDING_LIST_SELECT,
  });
  return toQuickRecordingListItems(rows);
}

/**
 * "My Quick Recordings" dashboard section — every one of the user's own
 * non-deleted quick recordings regardless of state (ready/processing/
 * failed), unlike the ready-only picker API above.
 */
export async function getQuickRecordingsForDashboard(userId: string): Promise<QuickRecordingListItem[]> {
  const rows = await db.meetingRequestRecording.findMany({
    where: {
      meetingRequest: { senderId: userId, origin: MeetingRequestOrigin.quick_recording },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: RECORDING_LIST_SELECT,
  });
  return toQuickRecordingListItems(rows);
}

/**
 * Dashboard delete action — creator-only. Always allowed, including for a
 * currently-linked recording (the client is expected to have already shown
 * the "this is shared in X" warning from the same resolved link this file
 * computes above; this function doesn't re-check that, same "confirmation
 * is a UI concern" split as every other AlertDialog-gated delete in this
 * app). The underlying MinIO object is removed immediately; the DB row is
 * soft-deleted (deletedAt set, objectKey left as-is) so a still-embedded
 * player elsewhere can render its distinct "deleted by owner" state
 * (getMeetingRequestRecordingObjectKey's deletedAt check) instead of just
 * vanishing. ownerType/FK are deliberately left untouched — deleting
 * doesn't unlink; the "deleted by owner" message *is* what the link now
 * resolves to.
 */
export async function deleteQuickRecording(meetingRequestId: string, userId: string): Promise<void> {
  await getOwnQuickRecording(meetingRequestId, userId);
  const recordings = await db.meetingRequestRecording.findMany({
    where: { meetingRequestId, deletedAt: null },
    select: { id: true, objectKey: true },
  });
  if (recordings.length === 0) throw new QuickRecordingError(404, "Recording not found.");

  await Promise.all(recordings.map((r) => (r.objectKey ? deleteRecordingObject(r.objectKey) : Promise.resolve())));
  await db.meetingRequestRecording.updateMany({
    where: { id: { in: recordings.map((r) => r.id) } },
    data: { deletedAt: new Date() },
  });
}
