import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { withSignedPhotoUrls } from "@/lib/team-server";
import { teamMemberFormDataSchema } from "@/lib/validation/team-member";
import { uploadTeamPhoto, UploadValidationError } from "@/lib/storage";

export async function GET() {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const members = await db.teamMember.findMany({ orderBy: { displayOrder: "asc" } });
  return NextResponse.json({ members: await withSignedPhotoUrls(members) });
}

export async function POST(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = teamMemberFormDataSchema.safeParse({
    name: formData.get("name"),
    roleBadge: formData.get("roleBadge"),
    title: formData.get("title"),
    bio: formData.get("bio"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const photo = formData.get("photo");
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await uploadTeamPhoto(photo);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  // New members are appended to the end of the display order; reordering
  // is handled separately (POST /api/admin/team/reorder) to keep this
  // endpoint's contract simple.
  const last = await db.teamMember.findFirst({ orderBy: { displayOrder: "desc" } });
  const displayOrder = (last?.displayOrder ?? -1) + 1;

  const member = await db.teamMember.create({
    data: {
      name: parsed.data.name,
      roleBadge: parsed.data.roleBadge,
      title: parsed.data.title,
      bio: parsed.data.bio,
      active: parsed.data.active,
      photoUrl,
      displayOrder,
    },
  });

  // The public page and any already-visited client-side navigation cache
  // for it must be invalidated, or the new/edited photo won't show up
  // until an unrelated full reload.
  revalidatePath("/our-team");

  return NextResponse.json({ member: await withSignedPhotoUrls([member]).then((m) => m[0]) });
}
