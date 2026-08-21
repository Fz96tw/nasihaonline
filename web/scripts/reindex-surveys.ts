import "dotenv/config";
import { db } from "@/lib/db";
import { ensureSurveysIndexConfigured } from "@/lib/meilisearch";
import { syncSurveyToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for surveys that predate the Meilisearch index (§7.2),
 * same rationale as scripts/reindex-forum-threads.ts. Unfiltered:
 * syncSurveyToIndex re-derives index-eligibility (open/closed,
 * audienceMembers) itself.
 *
 *   npx tsx scripts/reindex-surveys.ts
 */
async function main() {
  await ensureSurveysIndexConfigured();

  const surveys = await db.survey.findMany({ select: { id: true } });
  console.log(`Reindexing ${surveys.length} survey(s)...`);

  for (const survey of surveys) {
    await syncSurveyToIndex(survey.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
