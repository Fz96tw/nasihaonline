import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getKnowledgeCategories, getKnowledgeTags } from "@/lib/library-server";
import { SubmitResourceForm } from "@/components/library/submit-resource-form";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Add Content to Knowledge Library — NASIHA",
};

// "Submit Resource" (§4.9) — member-auth only, no tier gate (same as Write a
// Post). Every submission enters pending_review; POST /api/library enforces
// the same gate server-side regardless of how this page is reached.
// `?type=` preselects the content-type dropdown — used by the retired
// /blog/new's redirect to /library/new?type=blog_post, so a bookmarked
// "Write a Post" link still lands on the right form section.
export default async function NewLibraryItemPage({ searchParams }: { searchParams: { type?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const initialContentType = Object.values(KnowledgeContentType).includes(
    searchParams.type as KnowledgeContentType,
  )
    ? (searchParams.type as KnowledgeContentType)
    : undefined;

  const [categories, tags] = await Promise.all([getKnowledgeCategories(), getKnowledgeTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Content to Knowledge Library</h1>
        <p className="text-muted-foreground">
          Share a resource with the NASIHA community. A Library Steward reviews every submission before it
          appears in the Library.
        </p>
      </div>

      <SubmitResourceForm
        categories={categories}
        tags={tags}
        currentUserId={user.id}
        initialContentType={initialContentType}
      />
    </main>
  );
}
