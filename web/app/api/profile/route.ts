import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
import { profilePatchSchema } from "@/lib/validation/profile";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const profile = await getOrCreateProfile(user.id);

  return NextResponse.json({
    user: { name: user.name, email: user.email },
    profile: withResolvedAvatarUrl(profile),
  });
}

export async function PATCH(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const body = await request.json().catch(() => null);
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await getOrCreateProfile(user.id);

  const [, profile] = await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { name: parsed.data.name } }),
    db.profile.update({
      where: { userId: user.id },
      data: {
        bio: parsed.data.bio,
        countryRegion: parsed.data.countryRegion,
        titleSpecialty: parsed.data.titleSpecialty,
        careerStage: parsed.data.careerStage,
        expertiseAreas: parsed.data.expertiseAreas,
        learningTopics: parsed.data.learningTopics,
        listInDirectory: parsed.data.listInDirectory,
        showSpecialtyLocation: parsed.data.showSpecialtyLocation,
      },
    }),
  ]);

  await enqueueProfileIndexSync(user.id);

  return NextResponse.json({
    user: { name: parsed.data.name, email: user.email },
    profile: withResolvedAvatarUrl(profile),
  });
}
