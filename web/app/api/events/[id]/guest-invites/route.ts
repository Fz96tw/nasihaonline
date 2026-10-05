import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError } from "@/lib/events-server";
import { inviteGuestsByEmail, MAX_INVITES_PER_REQUEST } from "@/lib/event-guest-invites-server";

const bodySchema = z.object({
  // Raw strings, validated per address server-side so one typo doesn't reject the batch.
  emails: z.array(z.string().max(320)).min(1).max(MAX_INVITES_PER_REQUEST),
  note: z.string().max(1000).nullish(),
});

/**
 * POST /api/events/:id/guest-invites — host/admin emails non-members an
 * invitation to an `open` event (host BCC'd, reply-to host). Returns one
 * outcome per address rather than failing the batch.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Enter between 1 and ${MAX_INVITES_PER_REQUEST} email addresses.` },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const outcomes = await inviteGuestsByEmail(id, user, parsed.data);
    return NextResponse.json({ outcomes });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
