/**
 * `<input type="datetime-local">`'s picker/steppers already round to this
 * increment when `step` is set, but that only governs the arrow/calendar UI
 * — a typed value can still land on any minute, so `snapDatetimeLocalValue`
 * below re-snaps on blur to cover that path too.
 */
export const DATETIME_LOCAL_STEP_SECONDS = 900;

/** Rounds a datetime-local input value ("YYYY-MM-DDTHH:mm") to the nearest 15-minute mark. */
export function snapDatetimeLocalValue(value: string): string {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setSeconds(0, 0);
  date.setMinutes(Math.round(date.getMinutes() / 15) * 15);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
