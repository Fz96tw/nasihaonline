import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPostBySlug, getPostComments } from "@/lib/blog-server";
import { getSessionUser } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CommentThread } from "@/components/blog/comment-thread";
import { PostFlagButton } from "@/components/blog/post-flag-button";

function formatPostDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPublishedPostBySlug(params.slug);
  return { title: post ? `${post.title} — Nasiha Blog` : "Post not found — Nasiha" };
}

// /blog/[slug] (§4.8) — public-readable, no auth required. Unpublished
// posts and unknown slugs both 404 rather than distinguishing the two, so
// a draft's existence isn't leaked to a signed-out visitor.
export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPublishedPostBySlug(params.slug);
  if (!post) notFound();

  const [comments, sessionUser] = await Promise.all([getPostComments(post.id), getSessionUser()]);

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      {post.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
        <img src={post.heroImageUrl} alt={post.title} className="mb-8 h-72 w-full rounded-lg object-cover" />
      )}

      <Badge variant="info" className="mb-3 w-fit">
        {post.category.name}
      </Badge>
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">{post.title}</h1>

      <div className="mb-8 flex items-center gap-3">
        <Avatar name={post.author.name ?? "Member"} src={post.author.avatarUrl} size="sm" />
        <div className="text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{post.author.name ?? "Member"}</div>
          <div>{formatPostDate(post.publishedAt)}</div>
        </div>
      </div>

      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: post.body }} />

      {sessionUser && (
        <div className="mt-6">
          <PostFlagButton slug={post.slug} initialFlagged={post.flagged} />
        </div>
      )}

      {post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag.slug} variant="neutral">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <CommentThread slug={post.slug} comments={comments} canComment={sessionUser !== null} />
    </main>
  );
}
