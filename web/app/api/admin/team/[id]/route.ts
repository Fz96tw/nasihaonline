import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { withSignedPhotoUrls } from "@/lib/team-server";
import { teamMemberFormDataSchema } from "@/lib/validation/team-member";
import { deleteAvatarObject, uploadTeamPhoto, UploadValidationError } from "@/lib/storage";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const existing = await db.teamMember.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const parsed = teamMemberFormDataSchema.safeParse({
    name: formData.get("name"),
    roleBadge: formData.get("roleBadge"),
    title: formData.get("title"),
    bio: formData.get("bio"),
    active: formData.get("active"),
    removePhoto: formData.get("removePhoto"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const photo = formData.get("photo");
  let photoUrl = existing.photoUrl;
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await uploadTeamPhoto(photo);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    await deleteAvatarObject(existing.photoUrl);
  } else if (parsed.data.removePhoto) {
    await deleteAvatarObject(existing.photoUrl);
    photoUrl = null;
  }

  const member = await db.teamMember.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      roleBadge: parsed.data.roleBadge,
      title: parsed.data.title,
      bio: parsed.data.bio,
      active: parsed.data.active,
      photoUrl,
    },
  });

  revalidatePath("/our-team");

  return NextResponse.json({ member: await withSignedPhotoUrls([member]).then((m) => m[0]) });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const existing = await db.teamMember.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  await db.teamMember.delete({ where: { id: params.id } });
  await deleteAvatarObject(existing.photoUrl);

  revalidatePath("/our-team");

  return NextResponse.json({ ok: true });
}
