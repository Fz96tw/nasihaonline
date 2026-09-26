import { NextResponse } from "next/server";
import { pingLiveKit } from "@/lib/livekit";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

type DependencyStatus = "up" | "down" | "not_configured";

const CHECK_TIMEOUT_MS = 2500;

/** Rejects instead of hanging, so a dead dependency can't stall the health check. */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
  ]);
}

async function checkRedis(): Promise<DependencyStatus> {
  try {
    await withTimeout(redis.ping());
    return "up";
  } catch {
    return "down";
  }
}

/** MinIO only backs recording and downloads, so it's optional: unset means "not configured", not "down". */
async function checkMinio(): Promise<DependencyStatus> {
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!endpoint) return "not_configured";
  try {
    const res = await withTimeout(fetch(`${endpoint.replace(/\/$/, "")}/minio/health/live`, { cache: "no-store" }));
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

/**
 * Liveness + dependency report. Always answers 200 so the container health
 * check never kills the app because Redis, LiveKit or MinIO is down: outages
 * show up as `status: "degraded"` with the per-dependency detail, and the app
 * keeps serving (start/join answer 503 for the parts that can't work).
 */
export async function GET() {
  const [redisStatus, livekit, minio] = await Promise.all([
    checkRedis(),
    pingLiveKit().catch((): DependencyStatus => "down"),
    checkMinio(),
  ]);
  const dependencies = { redis: redisStatus, livekit, minio };
  const degraded = Object.values(dependencies).some((status) => status === "down");
  return NextResponse.json({ status: degraded ? "degraded" : "ok", dependencies });
}
