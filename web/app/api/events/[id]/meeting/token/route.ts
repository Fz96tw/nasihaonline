import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { mintLiveKitToken } from "@/lib/livekit";

/**
 * POST /api/events/:id/meeting/token — mints a LiveKit join token for the
 * current caller (meeting-join-experience / LiveKit Meeting Infrastructure).
 * Deliberately unauthenticated-reachable, same rationale as the status
 * route: access control lives inside getEventMeetingStatus, which for a
 * signed-out caller now requires both an `open` event AND a `?rid=` query
 * param resolving to a real registration for it (registration-required
 * anonymous join, closing the earlier gap where any signed-out caller who
 * knew/guessed the event id could join unregistered). An anonymous
 * open-event attendee gets an ephemeral guest identity — LiveKit doesn't
 * need it to map to a real account, only to be unique per connection — but
 * `status.guestName` (their registered name/email) is used as the display
 * name instead of a bare "Guest".
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;
  const registrationId = new URL(request.url).searchParams.get("rid");

  try {
    const status = await getEventMeetingStatus(id, user?.id ?? null, registrationId);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    const identity = user?.id ?? `guest-${randomUUID()}`;
    const name = user?.name ?? status.guestName ?? "Guest";
    const credentials = await mintLiveKitToken(status.livekitRoomName, identity, name, status.isOrganizer);
    if (!credentials) {
      return NextResponse.json({ error: "Couldn't connect to the meeting. Try again shortly." }, { status: 502 });
    }
    return NextResponse.json(credentials);
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
