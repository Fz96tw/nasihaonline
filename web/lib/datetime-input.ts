/** Minutes between the times a scheduling picker offers. */
export const TIME_STEP_MINUTES = 15;

const pad = (n: number) => String(n).padStart(2, "0");

/** Every "HH:mm" on the TIME_STEP_MINUTES grid across one day: "00:00", "00:15", … "23:45". */
export const STEPPED_TIMES: readonly string[] = Array.from(
  { length: (24 * 60) / TIME_STEP_MINUTES },
  (_, i) => `${pad(Math.floor((i * TIME_STEP_MINUTES) / 60))}:${pad((i * TIME_STEP_MINUTES) % 60)}`,
);

/** "14:45" → "2:45 PM". Formatted by hand so server and client render identically. */
export function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${suffix}`;
}

/** Splits a "YYYY-MM-DDTHH:mm" value into its date and time halves ("" when absent). */
export function splitDateTimeLocal(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

/** Joins date and time halves back into "YYYY-MM-DDTHH:mm", or "" until both are chosen. */
export function joinDateTimeLocal({ date, time }: { date: string; time: string }): string {
  return date && time ? `${date}T${time}` : "";
}
