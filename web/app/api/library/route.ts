import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, createKnowledgeItem } from "@/lib/library-server";
import { createKnowledgeItemSchema } from "@/lib/validation/knowledge";

/**
 * POST /api/library — "Submit Resource" (§4.9), member-auth only (no tier
 * gate, same as POST /api/blog). Multipart rather than JSON since the
 * optional document upload and the item's fields are submitted as one
 * action — see lib/storage.ts's uploadKnowledgeDocument for the file
 * validation/storage step this delegates to via createKnowledgeItem.
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
  // invitedUserIds travels as a JSON-encoded array within the same
  // multipart body as everything else — falls back to [] for a malformed
  // value rather than erroring, same handling as POST /api/events.
  let invitedUserIds: unknown = [];
  const invitedUserIdsRaw = formData.get("invitedUserIds");
  if (typeof invitedUserIdsRaw === "string" && invitedUserIdsRaw.length > 0) {
    try {
      invitedUserIds = JSON.parse(invitedUserIdsRaw);
    } catch {
      invitedUserIds = [];
    }
  }

  const parsed = createKnowledgeItemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    body: formData.get("body") || null,
    contentType: formData.get("contentType"),
    level: formData.get("level"),
    communityIds: formData.getAll("communityIds"),
    categoryIds: formData.getAll("categoryIds"),
    tagIds: formData.getAll("tagIds"),
    youtubeUrl: formData.get("youtubeUrl") || null,
    externalUrl: formData.get("externalUrl") || null,
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
    licenseConsented: formData.get("licenseConsented") === "true",
    visibility: formData.get("visibility") || "public",
    invitedUserIds,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fileField = formData.get("file");
  const file = fileField instanceof File && fileField.size > 0 ? fileField : null;
  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const item = await createKnowledgeItem(user.id, { ...parsed.data, file, heroImage });
    return NextResponse.json({ id: item.id }, { status: 201 });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
