import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, createReviewItem } from "@/lib/review-server";
import { createReviewItemSchema } from "@/lib/validation/review";
import { enqueueReviewItemIndexSync } from "@/lib/queues/search-index-queue";

/**
 * POST /api/review-feedback — "Submit an Item" for peer review. Multipart,
 * same shape as POST /api/library, since the optional document upload and
 * the item's fields travel as one action.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();

  let invitedUserIds: unknown = [];
  const invitedUserIdsRaw = formData.get("invitedUserIds");
  if (typeof invitedUserIdsRaw === "string" && invitedUserIdsRaw.length > 0) {
    try {
      invitedUserIds = JSON.parse(invitedUserIdsRaw);
    } catch {
      invitedUserIds = [];
    }
  }

  const parsed = createReviewItemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    contentType: formData.get("contentType"),
    level: formData.get("level"),
    categoryIds: formData.getAll("categoryIds"),
    tagIds: formData.getAll("tagIds"),
    youtubeUrl: formData.get("youtubeUrl") || null,
    externalUrl: formData.get("externalUrl") || null,
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
    audienceMode: formData.get("audienceMode") || "invite",
    invitedUserIds,
    volunteerNote: formData.get("volunteerNote") || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fileField = formData.get("file");
  const file = fileField instanceof File && fileField.size > 0 ? fileField : null;
  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const item = await createReviewItem(user.id, {
      title: parsed.data.title,
      description: parsed.data.description,
      contentType: parsed.data.contentType,
      level: parsed.data.level,
      categoryIds: parsed.data.categoryIds,
      tagIds: parsed.data.tagIds,
      youtubeUrl: parsed.data.youtubeUrl,
      externalUrl: parsed.data.externalUrl,
      deidentificationConfirmed: parsed.data.deidentificationConfirmed,
      invitedUserIds: parsed.data.audienceMode === "invite" ? parsed.data.invitedUserIds : [],
      seekingReviewers: parsed.data.audienceMode === "volunteers",
      volunteerNote: parsed.data.audienceMode === "volunteers" ? parsed.data.volunteerNote : null,
      file,
      heroImage,
    });
    await enqueueReviewItemIndexSync(item.id);
    return NextResponse.json({ id: item.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
