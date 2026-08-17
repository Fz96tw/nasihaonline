-- Cleanup migration for the Blog-into-Knowledge-Library consolidation
-- (see /home/nadeem/.claude/plans/ancient-exploring-music.md). Every Post/
-- PostComment row was already migrated into KnowledgeItem/ForumPost by
-- scripts/migrate-blog-to-library.ts and verified for row-count parity;
-- app/blog/** has been redirect-only (via legacy_blog_slugs, untouched by
-- this migration) since the earlier cutover. This is the destructive step
-- that finally drops the retired tables/columns.

-- Junction/child tables first (FK dependents of posts/post_categories/post_tags).
DROP TABLE "post_tags_on_posts";
DROP TABLE "post_categories_on_posts";
DROP TABLE "post_comments";
DROP TABLE "post_views";

-- ContributionEvent.postId (nullable, ON DELETE SET NULL) must be dropped
-- before the posts table it references.
ALTER TABLE "contribution_events" DROP CONSTRAINT "contribution_events_postId_fkey";
DROP INDEX "contribution_events_postId_key";
ALTER TABLE "contribution_events" DROP COLUMN "postId";

-- Now safe to drop posts itself, then its now-unreferenced taxonomy tables.
DROP TABLE "posts";
DROP TABLE "post_tags";
DROP TABLE "post_categories";
