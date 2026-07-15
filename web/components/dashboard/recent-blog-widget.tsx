import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentlyPublishedPosts } from "@/lib/blog-server";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function RecentBlogWidget() {
  const posts = await getRecentlyPublishedPosts();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent blog posts</CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No posts yet.{" "}
            <Link href="/blog/new" className="text-primary hover:underline">
              Write a post
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {posts.map((post) => (
              <li key={post.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <Link href={`/blog/${post.slug}`} className="block truncate text-sm font-medium hover:underline">
                  {post.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {post.category.name} · {formatDate(post.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/blog" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Browse the Blog
        </Link>
      </CardContent>
    </Card>
  );
}
