import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { deleteAvatarObject, uploadProfileAvatar, UploadValidationError } from "@/lib/storage";
import { recordAdminAction } from "@/lib/audit-server";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";

/** Admin-on-behalf-of-a-member avatar replacement — same mechanics as POST /api/profile/avatar, targeting `params.id` instead of the caller's own session. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  const formData = await request.formData();
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  const existing = await getOrCreateProfile(target.id);

  let avatarUrl: string;
  try {
    avatarUrl = await uploadProfileAvatar(photo);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  await deleteAvatarObject(existing.avatarUrl);

  const profile = await db.profile.update({
    where: { userId: target.id },
    data: { avatarUrl },
    include: { skills: { include: { skill: true } }, communities: { include: { community: true } } },
  });

  await recordAdminAction({
    actorId: admin.id,
    action: "profile.avatar_updated",
    entityType: "User",
    entityId: target.id,
  });
  await enqueueProfileIndexSync(target.id);

  return NextResponse.json({ profile: withResolvedAvatarUrl(profile) });
}

/** Admin-on-behalf-of-a-member avatar removal — same mechanics as DELETE /api/profile/avatar. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
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

  const existing = await getOrCreateProfile(target.id);
  await deleteAvatarObject(existing.avatarUrl);

  const profile = await db.profile.update({
    where: { userId: target.id },
    data: { avatarUrl: null },
    include: { skills: { include: { skill: true } }, communities: { include: { community: true } } },
  });

  await recordAdminAction({
    actorId: admin.id,
    action: "profile.avatar_removed",
    entityType: "User",
    entityId: target.id,
  });
  await enqueueProfileIndexSync(target.id);

  return NextResponse.json({ profile: withResolvedAvatarUrl(profile) });
}
