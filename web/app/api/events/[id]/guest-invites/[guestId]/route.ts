import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError } from "@/lib/events-server";
import { resendGuestInvite, revokeGuest } from "@/lib/event-guest-invites-server";

type Ctx = { params: Promise<{ id: string; guestId: string }> };

async function handle(
  params: Ctx["params"],
  run: (eventId: string, user: Awaited<ReturnType<typeof requireUser>>, guestId: string) => Promise<void>,
) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
  const { id, guestId } = await params;
  try {
    await run(id, user, guestId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** POST /api/events/:id/guest-invites/:guestId — resend that guest's invitation email. */
export function POST(_request: Request, { params }: Ctx) {
  return handle(params, resendGuestInvite);
}

/** DELETE /api/events/:id/guest-invites/:guestId — revoke an invited or link guest's access. */
export function DELETE(_request: Request, { params }: Ctx) {
  return handle(params, revokeGuest);
}
