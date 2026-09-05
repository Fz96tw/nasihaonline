import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { decodeFeedCursor, isFeedItemType } from "@/lib/feed";
import { getMemberCommunityIdsForFiltering, getOrCreateProfile } from "@/lib/profile-server";

/** GET /api/whats-new — "Load more" pagination for the What's New feed (member-only, no tier restriction). */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const cursor = decodeFeedCursor(request.nextUrl.searchParams.get("cursor"));
  const type = request.nextUrl.searchParams.get("type");
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const myCommunities = request.nextUrl.searchParams.get("myCommunities") === "1";
  const profile = await getOrCreateProfile(user.id);
  const page = await getFeedPage({
    cursor,
    types: isFeedItemType(type) ? [type] : undefined,
    viewerId: user.id,
    viewerRole: user.role,
    q,
    communityIds: getMemberCommunityIdsForFiltering(profile, myCommunities),
  });
  return NextResponse.json(page);
}
