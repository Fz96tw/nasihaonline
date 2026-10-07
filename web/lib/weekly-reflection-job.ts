// No "server-only" guard: imported by scripts/worker.ts, which runs outside
// Next's server runtime — same convention as lib/weekly-digest-job.ts.
import { DEFAULT_REFLECTION_SCHEDULE, isReflectionDue, type ReflectionSchedule } from "@/lib/reflection-schedule";
import { postWeeklyReflection, type WeeklyReflectionResult } from "@/lib/weekly-reflection-post";

export type WeeklyReflectionCheckResult = { status: "disabled" } | { status: "not-due" } | WeeklyReflectionResult;

/**
 * Where the schedule comes from. A fixed default for now (Monday 09:00 UTC,
 * enabled); read fresh on every tick so a settings-backed implementation can
 * replace this body without touching the job or the worker.
 */
export async function getReflectionSchedule(): Promise<ReflectionSchedule> {
  return DEFAULT_REFLECTION_SCHEDULE;
}

/**
 * One tick of the weekly-reflection check, run every few minutes by the
 * worker. Cheap when nothing is due; when due, postWeeklyReflection's own
 * once-per-week guard makes repeated ticks (and restarts) harmless.
 */
export async function runWeeklyReflectionCheck(now: Date = new Date()): Promise<WeeklyReflectionCheckResult> {
  const schedule = await getReflectionSchedule();
  if (!schedule.enabled) return { status: "disabled" };
  if (!isReflectionDue(now, schedule)) return { status: "not-due" };
  return postWeeklyReflection(now);
}
