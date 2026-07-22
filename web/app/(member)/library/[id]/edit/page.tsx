import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getKnowledgeItemForEdit, getKnowledgeCategories, getKnowledgeTags } from "@/lib/library-server";
import { SubmitResourceForm } from "@/components/library/submit-resource-form";
import { Role, KnowledgeStatus } from "@/lib/generated/prisma/enums";

const STATUS_NOTE: Record<KnowledgeStatus, string> = {
  [KnowledgeStatus.pending_review]: "This resource is awaiting Steward review.",
  [KnowledgeStatus.published]: "This resource is live in the Library — changes are visible immediately.",
  [KnowledgeStatus.flagged]: "This resource is live but flagged for review — changes are visible immediately.",
  [KnowledgeStatus.rejected]: "This resource was rejected — saving changes will resend it for review.",
};

export const metadata: Metadata = {
  title: "Edit Resource — NASIHA",
};

/**
 * /library/[id]/edit (editing a submission, §4.9) — contributor, Library
 * Steward (moderator), or admin only. Unlike /blog/[slug]/edit, which only
 * ever loads an already-published post, a Library item is editable at any
 * status (pending_review/published/flagged/rejected) — see
 * getKnowledgeItemForEdit. The requester is already authenticated and
 * already knows the id, so a plain 404 for "not found or not yours" is
 * sufficient, same reasoning as the Blog edit page.
 */
export default async function EditLibraryItemPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const item = await getKnowledgeItemForEdit(params.id);
  if (!item) notFound();

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;
  const isContributor = item.contributorId === user.id;
  if (!isPrivileged && !isContributor) notFound();

  const [categories, tags] = await Promise.all([getKnowledgeCategories(), getKnowledgeTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Resource</h1>
        <p className="text-muted-foreground">{STATUS_NOTE[item.status]}</p>
      </div>

      <SubmitResourceForm categories={categories} tags={tags} existingItem={item} />
    </main>
  );
}
