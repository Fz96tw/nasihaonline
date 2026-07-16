import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPostBySlug, getPostComments, getPostsByAuthor } from "@/lib/blog-server";
import { getSessionUser } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/components/blog/comment-thread";
import { PostFlagButton } from "@/components/blog/post-flag-button";
import { PostCard } from "@/components/blog/post-card";

function formatPostDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPublishedPostBySlug(params.slug);
  return { title: post ? `${post.title} — NASIHA Blog` : "Post not found — NASIHA" };
}

// /blog/[slug] (§4.8) — public-readable, no auth required. Unpublished
// posts and unknown slugs both 404 rather than distinguishing the two, so
// a draft's existence isn't leaked to a signed-out visitor.
export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPublishedPostBySlug(params.slug);
  if (!post) notFound();

  const [comments, sessionUser, moreFromAuthor] = await Promise.all([
    getPostComments(post.id),
    getSessionUser(),
    getPostsByAuthor(post.authorId, post.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <Link href="/blog" className="mb-6 inline-block text-sm text-muted-foreground hover:underline">
        ← Back to Blog
      </Link>

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
        <div className="mt-6 flex items-center gap-3">
          {(sessionUser.id === post.authorId || sessionUser.role === Role.admin) && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/blog/${post.slug}/edit`}>Edit Post</Link>
            </Button>
          )}
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

      {moreFromAuthor.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-xl font-bold tracking-tight">More from {post.author.name ?? "this author"}</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {moreFromAuthor.map((otherPost) => (
              <PostCard key={otherPost.id} post={otherPost} showExcerpt={false} />
            ))}
          </div>
        </div>
      )}

      <CommentThread slug={post.slug} comments={comments} canComment={sessionUser !== null} />
    </main>
  );
}
