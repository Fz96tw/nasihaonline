import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getReviewCategories, getReviewTags } from "@/lib/review-server";
import { SubmitReviewItemForm } from "@/components/review/submit-review-item-form";

export const metadata: Metadata = {
  title: "Submit Item for Peer Review — NASIHA",
};

/**
 * /review-feedback/new — "Submit Item for Peer Review". Member-auth
 * only, no tier gate (same as Library's Submit Resource page).
 */
export default async function NewReviewItemPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [categories, tags] = await Promise.all([getReviewCategories(), getReviewTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Item for Peer Review</h1>
        <p className="text-muted-foreground">
          Share your work with a hand-picked group of reviewers, or open a call for community volunteers.
        </p>
      </div>

      <SubmitReviewItemForm categories={categories} tags={tags} currentUserId={user.id} />
    </main>
  );
}
