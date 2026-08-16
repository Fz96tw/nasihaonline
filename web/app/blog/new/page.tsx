import { permanentRedirect } from "next/navigation";

// Blog was consolidated into the Knowledge Library as the blog_post content
// type — see /home/nadeem/.claude/plans/ancient-exploring-music.md.
// /library/new itself enforces the sign-in gate "Write a Post" used to
// enforce here; no need to duplicate that check before redirecting.
export default function NewBlogPostPage() {
  permanentRedirect("/library/new?type=blog_post");
}
