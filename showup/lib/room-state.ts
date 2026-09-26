import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { redis } from "@/lib/redis";
import { TOKEN_TTL_SECONDS } from "@/lib/livekit";

/** What we remember about a claimed code. Keyed by the code's digest, never the raw code. */
export type RoomState = {
  hostIdentity: string;
  hostSecret: string;
  /** Epoch ms. Used to tell a fresh claim (host still connecting) from a stale one. */
  createdAt: number;
  /** This meeting's recording id, fixed at start so the host can be told it before any recording exists. */
  recId: string;
  /** Recovery passcode (host sees the plain text once at start; only the salted hash is kept). */
  passcodeSalt: string;
  passcodeHash: string;
};

/**
 * A claim lives at most as long as a join token, so a meeting can't outlive its
 * tokens and a crashed host frees the code on its own even if the LiveKit
 * `room_finished` webhook never arrives. Webhook activity and host reclaims
 * push it out again.
 */
export const CLAIM_TTL_SECONDS = TOKEN_TTL_SECONDS;

/** A claim whose LiveKit room is still empty is only treated as abandoned once it's this old, so a host who is mid-connect isn't robbed of their code. */
const FRESH_CLAIM_GRACE_MS = 60_000;

const keyFor = (digest: string) => `showup:room:${digest}`;

export function newHostSecret(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time comparison so the secret can't be probed byte by byte. */
export function secretsMatch(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function getRoomState(digest: string): Promise<RoomState | null> {
  const raw = await redis.get(keyFor(digest));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoomState;
  } catch {
    return null;
  }
}

/** Atomically claims a code (`SET NX`): of any number of simultaneous starters, exactly one gets true. */
export async function claimRoom(digest: string, state: RoomState): Promise<boolean> {
  const result = await redis.set(keyFor(digest), JSON.stringify(state), "EX", CLAIM_TTL_SECONDS, "NX");
  return result === "OK";
}

/** Pushes the claim's expiry out again (host reclaim, webhook activity). No-op if the claim is already gone. */
export async function refreshRoom(digest: string): Promise<void> {
  await redis.expire(keyFor(digest), CLAIM_TTL_SECONDS);
}

/** Frees the code unconditionally (LiveKit `room_finished`, or rolling back our own claim). */
export async function releaseRoom(digest: string): Promise<void> {
  await redis.del(keyFor(digest));
}

// Compare-and-delete: only removes the claim if it is still the exact one we
// looked at, so two starters that both judged the same claim stale can't
// delete each other's fresh replacement.
const RELEASE_IF_UNCHANGED = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0`;

/** Frees an abandoned claim only if nobody replaced it meanwhile. */
export async function releaseStaleRoom(digest: string, state: RoomState): Promise<boolean> {
  const deleted = await redis.eval(RELEASE_IF_UNCHANGED, 1, keyFor(digest), JSON.stringify(state));
  return deleted === 1;
}

/** True when a claim is old enough that an empty LiveKit room means its host is gone. */
export function isPastGrace(state: RoomState): boolean {
  return Date.now() - state.createdAt > FRESH_CLAIM_GRACE_MS;
}
