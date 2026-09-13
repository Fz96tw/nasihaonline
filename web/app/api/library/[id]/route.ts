import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, deleteKnowledgeItem, updateKnowledgeItem } from "@/lib/library-server";
import { draftKnowledgeItemSchema, updateKnowledgeItemSchema } from "@/lib/validation/knowledge";
import { enqueueKnowledgeItemIndexSync } from "@/lib/queues/search-index-queue";
import { KnowledgeVisibility } from "@/lib/generated/prisma/enums";

/**
 * PATCH /api/library/:id — editing a submission (§4.9), contributor / Library
 * Steward / admin only (enforced in updateKnowledgeItem). Multipart rather
 * than JSON, same reason as POST /api/library: an optional replacement file
 * travels alongside the text fields in one request.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();

  // Save as Draft initiative — only meaningful while the row is still a
  // draft; updateKnowledgeItem itself rejects mode: "draft" against a
  // non-draft row, and ignores licenseConsented/visibility/invitedUserIds
  // once the row is no longer a draft (same create-only fields as before).
  const mode = formData.get("action") === "draft" ? "draft" : "submit";
  const schema = mode === "draft" ? draftKnowledgeItemSchema : updateKnowledgeItemSchema;
  let invitedUserIds: unknown = [];
  const invitedUserIdsRaw = formData.get("invitedUserIds");
  if (typeof invitedUserIdsRaw === "string" && invitedUserIdsRaw.length > 0) {
    try {
      invitedUserIds = JSON.parse(invitedUserIdsRaw);
    } catch {
      invitedUserIds = [];
    }
  }

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    body: formData.get("body") || null,
    contentType: formData.get("contentType"),
    level: formData.get("level") || null,
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

  // updateKnowledgeItemSchema (used for mode: "submit") has no
  // licenseConsented/visibility/invitedUserIds fields, so Zod strips them
  // from parsed.data even though we passed them above — re-attach them
  // directly from the raw form values. updateKnowledgeItem only reads these
  // while the row is still a draft, so this is a no-op for every other edit.
  const draftTransitionFields = {
    licenseConsented: formData.get("licenseConsented") === "true",
    visibility: (formData.get("visibility") as KnowledgeVisibility | null) ?? KnowledgeVisibility.public,
    invitedUserIds: invitedUserIds as string[],
  };

  try {
    const item = await updateKnowledgeItem(
      params.id,
      user,
      { ...parsed.data, ...draftTransitionFields, file, heroImage },
      mode,
    );
    await enqueueKnowledgeItemIndexSync(item.id);
    return NextResponse.json({ id: item.id });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/**
 * DELETE /api/library/:id — removing a submission (§4.9), contributor /
 * Library Steward / admin only (enforced in deleteKnowledgeItem). Re-syncing
 * the index afterward re-derives eligibility from the DB (now gone) and
 * removes the Meilisearch doc, same "re-derive, don't trust the caller"
 * shape as every other write path here.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await deleteKnowledgeItem(params.id, user);
    await enqueueKnowledgeItemIndexSync(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
