import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getSharedContext } from "@/lib/members-server";

export async function GET(_request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { memberId } = await params;
  const context = await getSharedContext(user.id, memberId);

  return NextResponse.json({ context }, { headers: { "cache-control": "no-store" } });
}
