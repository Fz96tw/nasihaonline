// Client-safe shapes shared by the /admin/weekly-reflection page and its
// components (no db imports, so client components may import this).

export type ReflectionQuoteDto = {
  id: string;
  text: string;
  author: string;
  source: string | null;
  prompt: string;
  active: boolean;
  /** ISO timestamp, or null if never posted. */
  lastPostedAt: string | null;
  timesPosted: number;
};

export type ReflectionNextDto = { quote: ReflectionQuoteDto; via: "override" | "rotation" } | null;

export function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${suffix}`;
}
