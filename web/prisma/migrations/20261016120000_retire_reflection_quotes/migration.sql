-- Retire the original general-wisdom Weekly Reflection pool in favour of the
-- learning & growth list in prisma/reflection-quotes-data.ts. Rows are kept
-- (posted threads still link to them via reflection_posts.quoteId), just taken
-- out of rotation. Migrations run before the seed, so the new quotes it
-- creates afterwards start out active.
UPDATE "reflection_quotes" SET "active" = false;
