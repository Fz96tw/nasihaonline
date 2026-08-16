import { permanentRedirect } from "next/navigation";

// Blog was consolidated into the Knowledge Library as the blog_post content
// type — see /home/nadeem/.claude/plans/ancient-exploring-music.md. `type`
// matches LibraryPage's own searchParams.type filter (KnowledgeContentType),
// not a made-up param name.
export default function BlogPage() {
  permanentRedirect("/library?type=blog_post");
}
