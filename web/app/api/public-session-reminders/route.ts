import { NextResponse } from "next/server";
import { getPublicReminderEvents } from "@/lib/events-server";

// Queries the DB; without this Next prerenders it at build time (no DB in the Docker build).
export const dynamic = "force-dynamic";

/**
 * GET /api/public-session-reminders — public events (the ones already on
 * /events for a signed-out visitor) inside the "starting soon" window or in
 * progress, for the signed-out floating reminder. No auth; exposes only a
 * link to the public event page, never the meeting URL or LiveKit room.
 */
export async function GET() {
  const sessions = await getPublicReminderEvents();
  return NextResponse.json(
    { sessions },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } },
  );
}
