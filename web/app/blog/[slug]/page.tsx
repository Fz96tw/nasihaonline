import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPostBySlug, getPostComments, getPostsByAuthor, getPostViewCount } from "@/lib/blog-server";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryMemberById, getMentionableMembers } from "@/lib/members-server";
import { countAllComments } from "@/lib/blog";
import { Role } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/components/blog/comment-thread";
import { PostFlagButton } from "@/components/blog/post-flag-button";
import { PostViewCounter } from "@/components/blog/post-view-counter";
import { BackLink } from "@/components/back-link";
import { PostCard } from "@/components/blog/post-card";
import { PostAuthorInfo } from "@/components/blog/post-author-info";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const [comments, sessionUser, moreFromAuthor, viewCount, mentionableMembers] = await Promise.all([
    getPostComments(post.id),
    getSessionUser(),
    getPostsByAuthor(post.authorId, post.id),
    getPostViewCount(post.id),
    getMentionableMembers(),
  ]);
  // Directory profiles are member-only content — an anonymous visitor to
  // this public page never gets the profile dialog, only the plain avatar.
  const authorProfile = sessionUser ? await getDirectoryMemberById(post.authorId) : null;

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <BackLink fallbackHref="/blog" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline" />

      {post.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
        <img src={post.heroImageUrl} alt={post.title} className="mb-8 h-72 w-full rounded-lg object-cover" />
      )}

      <Badge variant="info" className="mb-3 w-fit">
        {post.category.name}
      </Badge>
      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">{post.title}</h1>

      <div className="mb-8 flex items-center justify-between gap-3">
        <PostAuthorInfo
          name={post.author.name ?? "Member"}
          avatarUrl={post.author.avatarUrl}
          dateLabel={formatPostDate(post.publishedAt)}
          authorProfile={authorProfile}
        />
        <PostViewCounter slug={post.slug} initialViews={viewCount} commentCount={countAllComments(comments)} />
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

      <Tabs defaultValue="comments" className="mt-12">
        <TabsList>
          <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
          {moreFromAuthor.length > 0 && (
            <TabsTrigger value="more-from">More from {post.author.name ?? "this author"}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="comments">
          <CommentThread
            slug={post.slug}
            comments={comments}
            canComment={sessionUser !== null}
            mentionableMembers={mentionableMembers}
          />
        </TabsContent>

        {moreFromAuthor.length > 0 && (
          <TabsContent value="more-from">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {moreFromAuthor.map((otherPost) => (
                <PostCard key={otherPost.id} post={otherPost} showExcerpt={false} />
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </main>
  );
}
