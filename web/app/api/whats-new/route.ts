import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { decodeFeedCursor } from "@/lib/feed";

/** GET /api/whats-new — "Load more" pagination for the What's New feed (member-only, no tier restriction). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const cursor = decodeFeedCursor(request.nextUrl.searchParams.get("cursor"));
  const page = await getFeedPage({ cursor });
  return NextResponse.json(page);
}
