import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { runHealthChecks } from "@/lib/health";

// Public and unauthenticated on purpose: polled by the external uptime
// monitor and by scripts/deploy-vps.sh. It is not under any protected prefix
// in middleware.ts, and GET skips the CSRF check.
export const dynamic = "force-dynamic";

export async function GET() {
  const { status, body } = await runHealthChecks({
    db: () => db.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
  });

  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
