import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError } from "@/lib/events-server";
import { listPendingGuests } from "@/lib/event-guest-invites-server";

/**
 * GET /api/events/:id/guest-approvals — a private event's shareable-link
 * guests still waiting to be let in. Host, co-host or admin only (enforced
 * in listPendingGuests); polled by PendingGuestApprovals in the waiting room
 * and live meeting.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
  const { id } = await params;
  try {
    return NextResponse.json({ guests: await listPendingGuests(id, user) });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
