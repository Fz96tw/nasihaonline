import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe for the container health check. Dependency status (Redis, LiveKit, MinIO) is added with the room-state objective. */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
