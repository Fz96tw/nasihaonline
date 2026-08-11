import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getReviewItemForEdit, getReviewCategories, getReviewTags } from "@/lib/review-server";
import { SubmitReviewItemForm } from "@/components/review/submit-review-item-form";
import { Role, ReviewItemStatus } from "@/lib/generated/prisma/enums";

const STATUS_NOTE: Record<ReviewItemStatus, string> = {
  [ReviewItemStatus.open]: "This review is open — reviewers will see your changes right away.",
  [ReviewItemStatus.closed]: "This review is closed — changes are still visible to your reviewers.",
};

export const metadata: Metadata = {
  title: "Edit Item — Peer Review & Feedback — NASIHA",
};

/**
 * /review-feedback/[id]/edit — submitter (or moderator/admin) only. A
 * plain 404 for "not found or not yours" is sufficient, same reasoning as
 * the Library's edit page.
 */
export default async function EditReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const item = await getReviewItemForEdit(id);
  if (!item) notFound();

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;
  const isSubmitter = item.submitterId === user.id;
  if (!isPrivileged && !isSubmitter) notFound();

  const [categories, tags] = await Promise.all([getReviewCategories(), getReviewTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Item</h1>
        <p className="text-muted-foreground">{STATUS_NOTE[item.status]}</p>
      </div>

      <SubmitReviewItemForm categories={categories} tags={tags} existingItem={item} />
    </main>
  );
}
