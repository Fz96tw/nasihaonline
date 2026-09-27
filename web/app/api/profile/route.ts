import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ProfileUpdateError, getOrCreateProfile, updateMemberProfile, withResolvedAvatarUrl } from "@/lib/profile-server";
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

  let profile;
  try {
    profile = await updateMemberProfile(user.id, parsed.data);
  } catch (error) {
    if (error instanceof ProfileUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  await enqueueProfileIndexSync(user.id);

  return NextResponse.json({
    user: { name: parsed.data.name, email: user.email },
    profile: withResolvedAvatarUrl(profile),
  });
}
