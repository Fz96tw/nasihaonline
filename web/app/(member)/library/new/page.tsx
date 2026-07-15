import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getKnowledgeCategories, getKnowledgeTags } from "@/lib/library-server";
import { SubmitResourceForm } from "@/components/library/submit-resource-form";

export const metadata: Metadata = {
  title: "Submit Resource — Nasiha",
};

// "Submit Resource" (§4.9) — member-auth only, no tier gate (same as Write a
// Post). Every submission enters pending_review; POST /api/library enforces
// the same gate server-side regardless of how this page is reached.
export default async function NewLibraryItemPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [categories, tags] = await Promise.all([getKnowledgeCategories(), getKnowledgeTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Resource</h1>
        <p className="text-muted-foreground">
          Share a resource with the Nasiha community. A Library Steward reviews every submission before it
          appears in the Library.
        </p>
      </div>

      <SubmitResourceForm categories={categories} tags={tags} />
    </main>
  );
}
