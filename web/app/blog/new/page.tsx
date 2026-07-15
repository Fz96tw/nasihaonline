import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPostCategories, getPostTags } from "@/lib/blog-server";
import { WritePostForm } from "@/components/blog/write-post-form";

export const metadata: Metadata = {
  title: "Write a Post — Nasiha",
};

// "Write a Post" (§4.8) — member-auth only, no tier gate (unlike Submit
// Event). Not under middleware's isProtectedPageRoute since /blog itself
// must stay public; this redirect is the enforcement point, mirroring
// /calendar/new's pattern.
export default async function NewBlogPostPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [categories, tags] = await Promise.all([getPostCategories(), getPostTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Write a Post</h1>
        <p className="text-muted-foreground">
          Share your knowledge with the Nasiha community. You&apos;ll be listed as the author.
        </p>
      </div>

      <WritePostForm categories={categories} tags={tags} />
    </main>
  );
}
