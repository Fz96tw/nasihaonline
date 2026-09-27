import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { recordAdminAction } from "@/lib/audit-server";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";
import {
  ProfileUpdateError,
  getOrCreateProfile,
  updateMemberProfile,
  withResolvedAvatarUrl,
  type ProfileWithSkills,
} from "@/lib/profile-server";
import { profilePatchSchema, type ProfilePatchValues } from "@/lib/validation/profile";

/** The current profile, reshaped to the same fields a PATCH body carries, so it can be diffed against one field-for-field. */
function toPatchShape(user: { name: string | null }, profile: ProfileWithSkills): ProfilePatchValues {
  return {
    name: user.name ?? "",
    bio: profile.bio ?? "",
    countryRegion: profile.countryRegion ?? "",
    cityId: profile.cityGeonameId,
    titleSpecialty: profile.titleSpecialty ?? "",
    careerStage: profile.careerStage ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    skillIds: profile.skills.map(({ skill }) => skill.id),
    expertiseAreas: profile.expertiseAreas,
    learningTopics: profile.learningTopics ?? "",
    interestAreas: profile.interestAreas,
    availability: profile.availability,
    listInDirectory: profile.listInDirectory,
    showSpecialtyLocation: profile.showSpecialtyLocation,
  };
}

/**
 * Which fields actually changed, for AdminActionLog.metadata — a list of
 * field names another admin can scan, not a full before/after blob of (say)
 * a 2000-char bio. Arrays compare order-insensitively (re-picking the same
 * skills in a different order isn't a change worth flagging).
 */
function diffProfilePatch(before: ProfilePatchValues, after: ProfilePatchValues): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after) as (keyof ProfilePatchValues)[]) {
    const b = before[key];
    const a = after[key];
    const same =
      Array.isArray(b) && Array.isArray(a) ? JSON.stringify([...b].sort()) === JSON.stringify([...a].sort()) : b === a;
    if (!same) changed.push(key);
  }
  return changed;
}

/**
 * Admin-on-behalf-of-a-member profile edit — same validated shape and same
 * updateMemberProfile (lib/profile-server.ts) as the member's own PATCH
 * /api/profile, just admin-gated and targeting `params.id` instead of the
 * caller's own session. Logged to AdminActionLog (§4.15's audit trail
 * pattern) so a member asking "why did my profile change" has an answer,
 * and so another admin reviewing /admin/activity can see it.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = profilePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = toPatchShape(target, await getOrCreateProfile(target.id));

  let profile;
  try {
    profile = await updateMemberProfile(target.id, parsed.data);
  } catch (error) {
    if (error instanceof ProfileUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const changedFields = diffProfilePatch(before, parsed.data);
  // No-op saves (the admin opened the form and clicked Save without
  // changing anything) don't need a history row.
  if (changedFields.length > 0) {
    await recordAdminAction({
      actorId: admin.id,
      action: "profile.updated",
      entityType: "User",
      entityId: target.id,
      metadata: { changedFields },
    });
  }

  await enqueueProfileIndexSync(target.id);

  return NextResponse.json({
    user: { name: parsed.data.name, email: target.email },
    profile: withResolvedAvatarUrl(profile),
  });
}
