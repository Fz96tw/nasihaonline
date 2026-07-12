import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getDirectoryMembers } from "@/lib/members-server";

export async function GET() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const members = await getDirectoryMembers();

  return NextResponse.json(
    { members },
    { headers: { "cache-control": "no-store" } },
  );
}
