// No "server-only" guard: imported by scripts/worker.ts, which runs outside
// Next's server runtime — same convention as lib/weekly-digest-job.ts.
import { isReflectionDue, type ReflectionSchedule } from "@/lib/reflection-schedule";
import { getWeeklyReflectionSettings } from "@/lib/settings";
import { postWeeklyReflection, type WeeklyReflectionResult } from "@/lib/weekly-reflection-post";

export type WeeklyReflectionCheckResult = { status: "disabled" } | { status: "not-due" } | WeeklyReflectionResult;

/**
 * The schedule, read fresh from SiteSettings on every tick — so an admin's
 * enable/day/hour change (/admin/weekly-reflection) applies on the next
 * 15-minute tick with no redeploy or re-registration.
 */
export async function getReflectionSchedule(): Promise<ReflectionSchedule> {
  const settings = await getWeeklyReflectionSettings();
  return {
    enabled: settings.weeklyReflectionEnabled,
    dayOfWeek: settings.weeklyReflectionDayOfWeek,
    hour: settings.weeklyReflectionHour,
  };
}

/**
 * One tick of the weekly-reflection check, run every few minutes by the
 * worker. Cheap when nothing is due; when due, postWeeklyReflection's own
 * once-per-week guard makes repeated ticks (and restarts) harmless.
 */
export async function runWeeklyReflectionCheck(
  now: Date = new Date(),
  options: Parameters<typeof postWeeklyReflection>[1] = {},
): Promise<WeeklyReflectionCheckResult> {
  const schedule = await getReflectionSchedule();
  if (!schedule.enabled) return { status: "disabled" };
  if (!isReflectionDue(now, schedule)) return { status: "not-due" };
  return postWeeklyReflection(now, options);
}
