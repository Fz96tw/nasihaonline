import "dotenv/config";
import { getOrCreateWeeklyReflectionUser } from "@/lib/system-user";

/**
 * Creates (or finds) the Clerk-less "NASIHA Weekly Reflection" organizational
 * user that authors the weekly forum thread. Safe to re-run. Usage:
 *
 *   npx tsx scripts/create-weekly-reflection-user.ts
 */
async function main() {
  const user = await getOrCreateWeeklyReflectionUser();
  console.log(`Weekly Reflection user ready: ${user.id} (${user.name}, role: ${user.role}, tier: ${user.tier}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
