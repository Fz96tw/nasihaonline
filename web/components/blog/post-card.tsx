import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import type { PostCard as PostCardData } from "@/lib/blog";

function formatPostDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Icon-tile fallback (§4.8's "falls back to an icon tile on brand-pale
// background when no image") for posts without a hero image.
function HeroImage({ src, title }: { src: string | null; title: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
    return <img src={src} alt={title} className="h-40 w-full rounded-t-lg object-cover" />;
  }
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-t-lg bg-secondary">
      <Newspaper className="h-10 w-10 text-secondary-foreground/40" />
    </div>
  );
}

export function PostCard({ post }: { post: PostCardData }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={`/blog/${post.slug}`}>
        <HeroImage src={post.heroImageUrl} title={post.title} />
      </Link>
      <CardHeader>
        <Badge variant="info" className="mb-1 w-fit">
          {post.category.name}
        </Badge>
        <CardTitle className="line-clamp-2 break-words text-xl">
          <Link href={`/blog/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </CardTitle>
        <div className="flex items-center gap-2 pt-1">
          <Avatar name={post.author.name ?? "Member"} src={post.author.avatarUrl} size="xs" />
          <span className="text-sm text-muted-foreground">
            {post.author.name ?? "Member"} · {formatPostDate(post.publishedAt)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</CardContent>
    </Card>
  );
}
