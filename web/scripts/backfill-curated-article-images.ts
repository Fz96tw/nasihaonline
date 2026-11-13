import "dotenv/config";
import { backfillMissingArticleImages } from "@/lib/curated-article-fetch";
import { db } from "@/lib/db";

/**
 * One-off: finds and caches an image for every non-rejected "From the Web"
 * article that has none (e.g. fetched while the worker couldn't reach MinIO).
 * Run inside the worker container so it uses the same MinIO/DB settings:
 *   docker compose exec worker npx tsx scripts/backfill-curated-article-images.ts
 */
async function main() {
  const result = await backfillMissingArticleImages();
  console.log(`[backfill-curated-article-images] checked ${result.checked}, added images to ${result.filled}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
