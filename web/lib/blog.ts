// Shared Blog types (§4.8) — mirrors lib/events.ts's split between plain
// data shapes (this file) and DB-touching queries (lib/blog-server.ts).

export type PostCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

export type PostTagOption = {
  id: string;
  name: string;
  slug: string;
};

export type PostCard = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  heroImageUrl: string | null;
  publishedAt: string;
  author: { name: string | null; avatarUrl: string | null };
  category: { name: string; slug: string };
};

export type PostDetail = PostCard & {
  body: string;
  authorId: string;
  categoryId: string;
  tagIds: string[];
  tags: { name: string; slug: string }[];
  flagged: boolean;
};

/** A comment on a Post (§4.8), nested by `parentId` into a reply tree. */
export type PostCommentNode = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  replies: PostCommentNode[];
};

// Total comment count for the square-chat icon, including nested replies —
// unlike the Comments tab's own label, which counts only root-level nodes.
export function countAllComments(nodes: PostCommentNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countAllComments(node.replies), 0);
}

// Plain-text excerpt from Tiptap-authored HTML — strips tags rather than
// rendering, so /blog cards never leak unclosed markup from a truncation
// cut mid-tag.
export function excerptFromHtml(html: string, maxLength = 180): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
