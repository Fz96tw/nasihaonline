import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";

// Blog was consolidated into the Knowledge Library as the blog_post content
// type — see /home/nadeem/.claude/plans/ancient-exploring-music.md §4.
// LegacyBlogSlug (populated once by scripts/migrate-blog-to-library.ts) is
// the only surviving slug -> id lookup once Post itself is gone; a slug
// with no matching row 404s rather than distinguishing "never existed" from
// "existed but wasn't migrated" — same "don't leak draft existence" caution
// the old public page had for an unpublished post.
export default async function BlogPostRedirectPage({ params }: { params: { slug: string } }) {
  const legacy = await db.legacyBlogSlug.findUnique({ where: { slug: params.slug }, select: { knowledgeItemId: true } });
  if (!legacy) notFound();
  permanentRedirect(`/library/${legacy.knowledgeItemId}`);
}
