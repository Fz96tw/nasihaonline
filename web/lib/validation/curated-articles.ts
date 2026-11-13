import { z } from "zod";

// Shared by the admin forms (client) and /api/admin/curated-articles routes (server).
export const ARTICLE_SOURCE_NAME_MAX = 80;
export const ARTICLE_SOURCE_URL_MAX = 1000;
export const ARTICLE_SOURCE_QUERY_MAX = 200;
export const ARTICLE_KEYWORDS_MAX = 30;
export const ARTICLE_KEYWORD_MAX = 60;
export const CURATED_TITLE_MAX = 300;
export const CURATED_EXCERPT_MAX = 400;

const keywordList = z
  .array(z.string().trim().max(ARTICLE_KEYWORD_MAX, `Keywords can be at most ${ARTICLE_KEYWORD_MAX} characters.`))
  .max(ARTICLE_KEYWORDS_MAX, `At most ${ARTICLE_KEYWORDS_MAX} keywords.`);

const communityIds = z.array(z.string().min(1)).max(20);

export const articleSourceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(ARTICLE_SOURCE_NAME_MAX),
    kind: z.enum(["rss", "news_search"]),
    url: z.string().trim().min(1, "Required.").max(ARTICLE_SOURCE_URL_MAX),
    includeKeywords: keywordList,
    excludeKeywords: keywordList,
    enabled: z.boolean(),
    communityIds,
  })
  .superRefine((value, ctx) => {
    if (value.kind === "rss") {
      let ok = false;
      try {
        const parsed = new URL(value.url);
        ok = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        ok = false;
      }
      if (!ok) ctx.addIssue({ code: "custom", path: ["url"], message: "Enter the feed's full http(s) URL." });
    } else if (value.url.length > ARTICLE_SOURCE_QUERY_MAX) {
      ctx.addIssue({ code: "custom", path: ["url"], message: `Search text can be at most ${ARTICLE_SOURCE_QUERY_MAX} characters.` });
    }
  });

export type ArticleSourceInput = z.infer<typeof articleSourceSchema>;

export const articleSourcePatchSchema = z.object({ enabled: z.boolean() });

export const curatedArticleUpdateSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(CURATED_TITLE_MAX),
  excerpt: z.string().trim().max(CURATED_EXCERPT_MAX),
  communityIds,
});

export type CuratedArticleUpdateInput = z.infer<typeof curatedArticleUpdateSchema>;

export const curatedArticleStatusSchema = z.object({ status: z.enum(["pending", "approved", "rejected"]) });

export const curatedArticleAddByUrlSchema = z.object({
  url: z.string().trim().url("Enter a full http(s) link.").max(ARTICLE_SOURCE_URL_MAX),
  communityIds,
});

export const curatedArticleSettingsSchema = z.object({ curatedArticlesFetchEnabled: z.boolean() });

/** Comma/newline-separated keywords from a text box → trimmed list (lowercased server-side). */
export function splitKeywords(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}
