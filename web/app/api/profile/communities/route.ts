import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateProfile } from "@/lib/profile-server";
import { profileCommunitiesPatchSchema } from "@/lib/validation/profile-communities";

/**
 * Sets a member's community membership — used by both the one-time
 * onboarding checklist (/welcome/communities) and the header search row's
 * later "edit" affordance, so both go through the same validated,
 * delete-then-recreate path (same convention as updateKnowledgeItem's
 * category rewrite in lib/library-server.ts).
 */
export async function PATCH(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = profileCommunitiesPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await getOrCreateProfile(user.id);

  if (!parsed.data.followsAllCommunities) {
    const communityIds = Array.from(new Set(parsed.data.communityIds));
    const validCommunities = await db.community.findMany({ where: { id: { in: communityIds } } });
    if (validCommunities.length !== communityIds.length) {
      return NextResponse.json({ error: "One or more selected communities are invalid." }, { status: 400 });
    }
  }

  const [, updated] = await db.$transaction([
    db.profileCommunity.deleteMany({ where: { profileId: profile.id } }),
    db.profile.update({
      where: { id: profile.id },
      data: {
        followsAllCommunities: parsed.data.followsAllCommunities,
        ...(parsed.data.followsAllCommunities
          ? {}
          : {
              communities: {
                createMany: {
                  data: Array.from(new Set(parsed.data.communityIds)).map((communityId) => ({ communityId })),
                },
              },
            }),
      },
      include: { communities: { include: { community: true } } },
    }),
  ]);

  return NextResponse.json({
    followsAllCommunities: updated.followsAllCommunities,
    communities: updated.communities.map((c) => ({ id: c.community.id, name: c.community.name })),
  });
}
