import { NextResponse } from "next/server";
import { getPublicUpcomingEvents } from "@/lib/events-server";

// Public, unauthenticated route (§4.6) — not listed in middleware's
// isProtectedApiRoute, and getPublicUpcomingEvents() never selects
// meetingUrl/deidentificationConfirmed, so there's no gate to bypass here.
export async function GET() {
  const events = await getPublicUpcomingEvents();

  return NextResponse.json({ events }, { headers: { "cache-control": "no-store" } });
}
