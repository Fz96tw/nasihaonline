import { Newspaper } from "lucide-react";
import { PostCard } from "@/components/blog/post-card";
import type { PostCard as PostCardData } from "@/lib/blog";

/** /members/[memberId]'s Blog Posts section (§4.5/§4.8) — this member's published posts, newest first. */
export function MemberBlogPosts({ posts }: { posts: PostCardData[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Newspaper className="h-4 w-4" />
        Blog Posts
      </h2>
      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">This member hasn&apos;t published any blog posts yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} showExcerpt={false} />
          ))}
        </div>
      )}
    </section>
  );
}
