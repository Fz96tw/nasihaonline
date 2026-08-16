import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";

// Blog was consolidated into the Knowledge Library as the blog_post content
// type — see /home/nadeem/.claude/plans/ancient-exploring-music.md §4.
// /library/[id]/edit itself enforces the sign-in + contributor/Steward/admin
// gate this page used to enforce — no need to duplicate that check before
// redirecting, only the slug -> id resolution is this page's job now.
export default async function EditBlogPostRedirectPage({ params }: { params: { slug: string } }) {
  const legacy = await db.legacyBlogSlug.findUnique({ where: { slug: params.slug }, select: { knowledgeItemId: true } });
  if (!legacy) notFound();
  permanentRedirect(`/library/${legacy.knowledgeItemId}/edit`);
}
