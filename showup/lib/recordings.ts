import "server-only";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { EgressStatus } from "livekit-server-sdk";
import type { EgressInfo } from "livekit-server-sdk";
import { redis } from "@/lib/redis";
import { getEgressInfo } from "@/lib/livekit-egress";
import { getLiveRoomStatus } from "@/lib/livekit";
import { presignRecordingDownload } from "@/lib/recordings-storage";

/**
 * A "recording" is one host session (one code claim): all the start/stop
 * cycles the host does become parts of it. It lives in a Redis hash so the
 * webhook, the status poll and the email trigger can each update their own
 * field atomically instead of racing on one JSON blob:
 *   meta            immutable JSON (RecordingMeta)
 *   e:{egressId}    JSON (PartRecord), one per egress
 *   finished        "1" once the LiveKit room has closed
 *   emailClaimed    "1" once one process owns sending the email (HSETNX)
 * Everything expires 24 hours after creation, matching the bucket's lifecycle rule.
 */
export const RECORDING_TTL_SECONDS = 24 * 60 * 60;

const recKey = (recId: string) => `showup:rec:${recId}`;
const egressKey = (egressId: string) => `showup:egress:${egressId}`;
/** codeDigest -> recIds, so "code + passcode" recovery can find a code's recordings. */
const indexKey = (digest: string) => `showup:recs:${digest}`;
/** codeDigest -> the recId of the meeting currently using it (for webhooks that only know the room). */
const roomRecKey = (digest: string) => `showup:roomrec:${digest}`;
const mailKey = (recId: string) => `showup:recmail:${recId}`;

export type RecordingMeta = {
  recId: string;
  digest: string;
  roomName: string;
  /** sha256 of the hostSecret; the secret itself is never stored here. */
  secretHash: string;
  passcodeSalt: string;
  passcodeHash: string;
  createdAt: number;
};

export type PartRecord = {
  state: "active" | "ended" | "failed";
  objectKey?: string;
  startedAt?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  error?: string;
};

export type RecordingStatus = "none" | "processing" | "ready" | "failed";

export type RecordingView = {
  recId: string;
  status: RecordingStatus;
  createdAt: number;
  expiresAt: number;
  parts: { index: number; durationSeconds: number | null; sizeBytes: number | null; url: string | null }[];
  error: string | null;
};

// --- secrets -----------------------------------------------------------------

export const newRecordingId = () => randomBytes(16).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const PASSCODE_WORDS = [
  "amber", "brook", "cedar", "dune", "ember", "fern", "glade", "harbor", "iris", "jade", "kelp", "lark", "maple",
  "nova", "opal", "pine", "quill", "river", "sage", "tide", "umber", "vale", "willow", "yarrow", "zephyr", "coral",
  "dawn", "flint", "grove", "haze", "ivory", "moss", "acorn", "birch", "cliff", "delta", "elm", "finch", "gorge",
  "heron", "inlet", "juniper", "knoll", "lotus", "mesa", "nectar", "orchid", "pebble", "quartz", "reef", "spruce",
  "thistle", "urchin", "violet", "wren", "xenia", "yew", "zinnia", "aspen", "bluff", "canyon", "drift", "estuary",
  "fjord",
];

/**
 * Four words from a 64-word list (24 bits). Recovery by code + passcode is
 * rate limited per code and per IP, so this is guess-resistant online; short
 * enough to jot down.
 */
export function generatePasscode(): string {
  return Array.from({ length: 4 }, () => PASSCODE_WORDS[randomInt(PASSCODE_WORDS.length)]).join("-");
}

export const normalizePasscode = (raw: string) => raw.trim().toLowerCase().replace(/[\s_]+/g, "-");

export function hashPasscode(passcode: string, salt: string): string {
  return scryptSync(normalizePasscode(passcode), salt, 32).toString("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const secretMatches = (meta: RecordingMeta, secret: string | null | undefined) =>
  !!secret && safeEqualHex(meta.secretHash, sha256(secret));

export const passcodeMatches = (meta: RecordingMeta, passcode: string) =>
  safeEqualHex(meta.passcodeHash, hashPasscode(passcode, meta.passcodeSalt));

// --- storage -----------------------------------------------------------------

/** Creates the recording the first time the host starts recording; later starts reuse it. */
export async function ensureRecording(meta: RecordingMeta): Promise<void> {
  const created = await redis.hsetnx(recKey(meta.recId), "meta", JSON.stringify(meta));
  if (created === 1) {
    await redis
      .multi()
      .expire(recKey(meta.recId), RECORDING_TTL_SECONDS)
      .sadd(indexKey(meta.digest), meta.recId)
      .expire(indexKey(meta.digest), RECORDING_TTL_SECONDS)
      .exec();
  }
  await redis.set(roomRecKey(meta.digest), meta.recId, "EX", RECORDING_TTL_SECONDS);
}

export async function getMeta(recId: string): Promise<RecordingMeta | null> {
  const raw = await redis.hget(recKey(recId), "meta");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecordingMeta;
  } catch {
    return null;
  }
}

export async function registerEgress(recId: string, egressId: string): Promise<void> {
  const part: PartRecord = { state: "active", startedAt: Date.now() };
  await redis
    .multi()
    .hset(recKey(recId), `e:${egressId}`, JSON.stringify(part))
    .set(egressKey(egressId), recId, "EX", RECORDING_TTL_SECONDS)
    .exec();
}

async function readParts(recId: string): Promise<[string, PartRecord][]> {
  const all = await redis.hgetall(recKey(recId));
  return Object.entries(all)
    .filter(([field]) => field.startsWith("e:"))
    .map(([field, value]) => [field.slice(2), JSON.parse(value) as PartRecord] as [string, PartRecord])
    .sort((a, b) => (a[1].startedAt ?? 0) - (b[1].startedAt ?? 0));
}

/**
 * Applies a finished (or failed) egress to its recording. Idempotent: the
 * webhook, a status poll and a retry can all deliver the same result.
 * Returns the recId so callers can follow up (e.g. email). Ignores egresses
 * that aren't ours.
 */
export async function applyEgressResult(info: EgressInfo): Promise<string | null> {
  const recId = await redis.get(egressKey(info.egressId));
  if (!recId) return null;

  const done =
    info.status === EgressStatus.EGRESS_COMPLETE ||
    info.status === EgressStatus.EGRESS_FAILED ||
    info.status === EgressStatus.EGRESS_ABORTED ||
    info.status === EgressStatus.EGRESS_LIMIT_REACHED;
  if (!done) return recId;

  const file = info.fileResults?.[0];
  const failed = info.status !== EgressStatus.EGRESS_COMPLETE || !file?.filename;
  const part: PartRecord = failed
    ? { state: "failed", error: info.error || "The recording didn't finish." }
    : {
        state: "ended",
        objectKey: file.filename,
        startedAt: file.startedAt ? Number(file.startedAt / BigInt(1_000_000)) : Date.now(),
        // duration is nanoseconds on the wire, size is bytes.
        durationSeconds: file.duration ? Number(file.duration / BigInt(1_000_000_000)) : undefined,
        sizeBytes: file.size ? Number(file.size) : undefined,
      };
  await redis.hset(recKey(recId), `e:${info.egressId}`, JSON.stringify(part));
  return recId;
}

/** Marks the meeting's recording as finished (room closed). Returns its recId, if the room had one. */
export async function markRoomFinished(digest: string): Promise<string | null> {
  const recId = await redis.get(roomRecKey(digest));
  if (!recId) return null;
  await redis.hset(recKey(recId), "finished", "1");
  return recId;
}

/**
 * Brings a recording up to date without relying on the webhook: asks LiveKit
 * about any egress still marked active, and treats an empty/absent room as
 * finished. Safe to call repeatedly (each poll of the exit screen does).
 */
export async function reconcile(recId: string, meta: RecordingMeta): Promise<void> {
  const parts = await readParts(recId);
  for (const [egressId, part] of parts) {
    if (part.state !== "active") continue;
    const info = await getEgressInfo(egressId);
    if (info) await applyEgressResult(info);
  }
  const finished = await redis.hget(recKey(recId), "finished");
  if (finished !== "1") {
    const room = await getLiveRoomStatus(meta.roomName);
    if (room && (!room.exists || room.numParticipants === 0)) await redis.hset(recKey(recId), "finished", "1");
  }
}

export async function isFinishedAndIdle(recId: string): Promise<boolean> {
  const [finished, parts] = await Promise.all([redis.hget(recKey(recId), "finished"), readParts(recId)]);
  return finished === "1" && parts.every(([, part]) => part.state !== "active");
}

export async function claimEmail(recId: string): Promise<boolean> {
  return (await redis.hsetnx(recKey(recId), "emailClaimed", "1")) === 1;
}
export const releaseEmailClaim = (recId: string) => redis.hdel(recKey(recId), "emailClaimed");
export const hasEmailClaim = async (recId: string) => (await redis.hget(recKey(recId), "emailClaimed")) === "1";

export type PendingEmail = { email: string; hostSecret: string };
export async function savePendingEmail(recId: string, pending: PendingEmail): Promise<boolean> {
  // NX: one address per recording; the first request wins, later ones can't redirect the link.
  return (await redis.set(mailKey(recId), JSON.stringify(pending), "EX", 24 * 60 * 60, "NX")) === "OK";
}
export async function readPendingEmail(recId: string): Promise<PendingEmail | null> {
  const raw = await redis.get(mailKey(recId));
  return raw ? (JSON.parse(raw) as PendingEmail) : null;
}
/** The address is deleted as soon as it has been used. */
export const deletePendingEmail = (recId: string) => redis.del(mailKey(recId));

/** Codes get reused, so a code's index can hold several hosts' recordings; callers filter by passcode. */
export async function recordingIdsForCode(digest: string): Promise<string[]> {
  return redis.smembers(indexKey(digest));
}

// --- presentation ------------------------------------------------------------

export async function describeRecording(meta: RecordingMeta): Promise<RecordingView> {
  const parts = await readParts(meta.recId);
  const active = parts.some(([, part]) => part.state === "active");
  const ready = parts.filter(([, part]) => part.state === "ended" && part.objectKey);
  const failures = parts.filter(([, part]) => part.state === "failed");

  const status: RecordingStatus = active ? "processing" : ready.length ? "ready" : failures.length ? "failed" : "none";
  const day = new Date(meta.createdAt).toISOString().slice(0, 10);

  const views = await Promise.all(
    ready.map(async ([, part], i) => ({
      index: i + 1,
      durationSeconds: part.durationSeconds ?? null,
      sizeBytes: part.sizeBytes ?? null,
      url: await presignRecordingDownload(part.objectKey!, `showup-${day}-part${i + 1}.mp4`),
    })),
  );

  return {
    recId: meta.recId,
    status,
    createdAt: meta.createdAt,
    expiresAt: meta.createdAt + RECORDING_TTL_SECONDS * 1000,
    parts: views,
    // Failures are reported even when other parts succeeded, so the host knows a segment is missing.
    error: failures.length ? failures[0][1].error ?? "Part of the recording didn't finish." : null,
  };
}
