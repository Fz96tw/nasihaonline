import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError } from "@/lib/events-server";
import { disableGuestLink, enableGuestLink, getGuestLinkState } from "@/lib/event-guest-invites-server";

/**
 * /api/events/:id/guest-link — host/admin management of an `open` event's
 * private guest-invite link (authorisation is enforced inside
 * event-guest-invites-server). GET returns the current token (null when the
 * feature is off) plus the invited/link guest list; POST turns it on, or
 * rotates it with { regenerate: true } (revoking the guests the old link
 * admitted); DELETE turns it off.
 */
async function handle(
  run: (user: Awaited<ReturnType<typeof requireUser>>, id: string) => Promise<unknown>,
  params: Promise<{ id: string }>,
) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
  const { id } = await params;
  try {
    return NextResponse.json(await run(user, id));
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle((user, id) => getGuestLinkState(id, user), params);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  const regenerate = body?.regenerate === true;
  return handle((user, id) => enableGuestLink(id, user, { regenerate }), params);
}

export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (user, id) => {
    await disableGuestLink(id, user);
    return { ok: true };
  }, params);
}
