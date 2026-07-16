import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPublishedPostBySlug, getPostCategories, getPostTags } from "@/lib/blog-server";
import { WritePostForm } from "@/components/blog/write-post-form";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Edit Post — NASIHA",
};

// /blog/[slug]/edit (§4.8, §11.12) — author or admin only. Unlike the public
// detail page's "404 rather than distinguish existence" caution (which
// protects a signed-out visitor from learning a draft exists), the requester
// here is already authenticated and already knows the slug, so a plain 404
// for "not found or not yours" is sufficient.
export default async function EditBlogPostPage({ params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const post = await getPublishedPostBySlug(params.slug);
  if (!post) notFound();

  const isAdmin = user.role === Role.admin;
  const isAuthor = post.authorId === user.id;
  if (!isAdmin && !isAuthor) notFound();

  const [categories, tags] = await Promise.all([getPostCategories(), getPostTags()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Post</h1>
        <p className="text-muted-foreground">Update your post below.</p>
      </div>

      <WritePostForm
        categories={categories}
        tags={tags}
        existingPost={{
          slug: post.slug,
          title: post.title,
          body: post.body,
          categoryId: post.categoryId,
          tagIds: post.tagIds,
          heroImageUrl: post.heroImageUrl,
        }}
      />
    </main>
  );
}
