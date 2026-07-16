import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ConductError, acknowledgeConductNotice } from "@/lib/conduct-server";

/**
 * POST /api/conduct/notices/[id]/acknowledge — the reported member dismisses
 * their own conduct notice (§4.15) from Settings/Dashboard. Self-service,
 * distinct from admin fulfillment — ownership is enforced in
 * acknowledgeConductNotice(), not just by session presence.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    const notice = await acknowledgeConductNotice(params.id, user.id);
    return NextResponse.json({ id: notice.id, acknowledgedAt: notice.acknowledgedAt });
  } catch (error) {
    if (error instanceof ConductError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
