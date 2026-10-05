import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { decodeFeedCursor, isFeedItemType } from "@/lib/feed";
import { getFollowingChips, getFollowingFeedAuthorIds } from "@/lib/member-follows-server";
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
  // "Following" pane: the viewer's own followed members only, browse mode —
  // no type/search/community combination (those belong to the All pane).
  if (request.nextUrl.searchParams.get("following") === "1") {
    const followedIds = await getFollowingFeedAuthorIds(user.id);
    if (followedIds.length === 0) return NextResponse.json({ items: [], nextCursor: null, hasMore: false, people: [] });
    // `member` narrows the pane to one person, but only ever to someone the
    // viewer actually follows — anything else falls back to everyone, so the
    // param can't be used to read an arbitrary member's items through here.
    const member = request.nextUrl.searchParams.get("member");
    const authorIds = member && followedIds.includes(member) ? [member] : followedIds;
    const page = await getFeedPage({ cursor, viewerId: user.id, viewerRole: user.role, authorIds });
    // Chips ride along on the unfiltered first page only (the client keeps them).
    const people =
      !cursor && authorIds === followedIds
        ? await getFollowingChips(followedIds, page.items.map((item) => item.author.id))
        : undefined;
    return NextResponse.json({ ...page, people });
  }

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
