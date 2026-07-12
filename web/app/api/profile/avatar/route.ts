import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { deleteAvatarObject, uploadProfileAvatar, UploadValidationError } from "@/lib/storage";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  const existing = await getOrCreateProfile(user.id);

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
    where: { userId: user.id },
    data: { avatarUrl },
    include: { skills: { include: { skill: true } } },
  });

  await enqueueProfileIndexSync(user.id);

  return NextResponse.json({ profile: withResolvedAvatarUrl(profile) });
}

export async function DELETE() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const existing = await getOrCreateProfile(user.id);
  await deleteAvatarObject(existing.avatarUrl);

  const profile = await db.profile.update({
    where: { userId: user.id },
    data: { avatarUrl: null },
    include: { skills: { include: { skill: true } } },
  });

  await enqueueProfileIndexSync(user.id);

  return NextResponse.json({ profile: withResolvedAvatarUrl(profile) });
}
