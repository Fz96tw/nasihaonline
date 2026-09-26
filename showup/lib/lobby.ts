import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redis } from "@/lib/redis";
import { CLAIM_TTL_SECONDS } from "@/lib/room-state";
import { ROOM_PREFIX } from "@/lib/room-code";

/** How long a rejected guest (by IP and by identity) is locked out of the code. */
export const REJECT_BLOCK_SECONDS = 10 * 60;

/** A waiting guest's record outlives their lobby token so a slow approval still redeems. */
const GUEST_TTL_SECONDS = 2 * 60 * 60 + 5 * 60;

export type LobbyStatus = "pending" | "approved" | "rejected" | "redeemed";

type LobbyGuest = { name: string; ip: string; secretHash: string; status: LobbyStatus };

/**
 * Lobby room name. Deliberately not `digestFromRoomName`-compatible (extra
 * suffix), so the shared LiveKit webhook ignores lobby rooms.
 */
export function lobbyRoomName(digest: string): string {
  return `${ROOM_PREFIX}${digest}-lobby`;
}

const flagKey = (digest: string) => `showup:lobby:on:${digest}`;
const guestKey = (digest: string, identity: string) => `showup:lobby:guest:${digest}:${identity}`;
const blockKey = (digest: string, kind: "ip" | "id", value: string) => `showup:lobby:block:${digest}:${kind}:${value}`;

const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

export async function isLobbyEnabled(digest: string): Promise<boolean> {
  return (await redis.get(flagKey(digest))) === "1";
}

/** Toggling never touches guests who are already waiting: only who gets sent to the lobby from now on. */
export async function setLobbyEnabled(digest: string, enabled: boolean): Promise<void> {
  if (enabled) await redis.set(flagKey(digest), "1", "EX", CLAIM_TTL_SECONDS);
  else await redis.del(flagKey(digest));
}

export async function clearLobbyFlag(digest: string): Promise<void> {
  await redis.del(flagKey(digest));
}

export async function isBlocked(digest: string, ip: string, identity?: string): Promise<boolean> {
  const keys = [blockKey(digest, "ip", ip), ...(identity ? [blockKey(digest, "id", identity)] : [])];
  return (await redis.exists(...keys)) > 0;
}

async function block(digest: string, ip: string, identity: string): Promise<void> {
  await redis
    .multi()
    .set(blockKey(digest, "ip", ip), "1", "EX", REJECT_BLOCK_SECONDS)
    .set(blockKey(digest, "id", identity), "1", "EX", REJECT_BLOCK_SECONDS)
    .exec();
}

/** Records a new waiting guest and returns the secret they must present to redeem an approval. */
export async function addPendingGuest(digest: string, identity: string, name: string, ip: string): Promise<string> {
  const secret = randomBytes(24).toString("base64url");
  const guest: LobbyGuest = { name, ip, secretHash: hashSecret(secret), status: "pending" };
  await redis.set(guestKey(digest, identity), JSON.stringify(guest), "EX", GUEST_TTL_SECONDS);
  return secret;
}

// Compare-and-set on the status field, atomically, so of any number of
// simultaneous approvals/redeems exactly one succeeds. Returns the guest JSON
// as it was before the change, or false.
const TRANSITION = `
local v = redis.call('get', KEYS[1])
if not v then return false end
local g = cjson.decode(v)
if g.status ~= ARGV[1] then return false end
g.status = ARGV[2]
redis.call('set', KEYS[1], cjson.encode(g), 'KEEPTTL')
return v`;

async function transition(digest: string, identity: string, from: LobbyStatus, to: LobbyStatus): Promise<LobbyGuest | null> {
  const before = await redis.eval(TRANSITION, 1, guestKey(digest, identity), from, to);
  if (typeof before !== "string") return null;
  try {
    return JSON.parse(before) as LobbyGuest;
  } catch {
    return null;
  }
}

/** pending -> approved. False if the guest is unknown or was already decided. */
export async function approveGuest(digest: string, identity: string): Promise<boolean> {
  return (await transition(digest, identity, "pending", "approved")) !== null;
}

/** pending -> rejected, and locks the guest's IP and identity out of the code for a while. */
export async function rejectGuest(digest: string, identity: string): Promise<boolean> {
  const guest = await transition(digest, identity, "pending", "rejected");
  if (!guest) return false;
  await block(digest, guest.ip, identity);
  return true;
}

export type RedeemResult =
  | { status: "unknown" }
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "redeemed" }
  | { status: "approved"; name: string };

/**
 * Read-only status for a guest, gated on their secret. Doesn't consume the
 * approval: `consumeApproval` does that once the main-room token is minted.
 */
export async function peekGuest(digest: string, identity: string, secret: string): Promise<RedeemResult> {
  const raw = await redis.get(guestKey(digest, identity));
  if (!raw) return { status: "unknown" };
  let guest: LobbyGuest;
  try {
    guest = JSON.parse(raw) as LobbyGuest;
  } catch {
    return { status: "unknown" };
  }
  const provided = Buffer.from(hashSecret(secret));
  const expected = Buffer.from(guest.secretHash);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { status: "unknown" };
  if (guest.status === "approved") return { status: "approved", name: guest.name };
  return { status: guest.status };
}

/** approved -> redeemed, exactly once. The caller mints the main-room token only if this returns true. */
export async function consumeApproval(digest: string, identity: string): Promise<boolean> {
  return (await transition(digest, identity, "approved", "redeemed")) !== null;
}

export async function guestExists(digest: string, identity: string): Promise<boolean> {
  return (await redis.exists(guestKey(digest, identity))) === 1;
}
