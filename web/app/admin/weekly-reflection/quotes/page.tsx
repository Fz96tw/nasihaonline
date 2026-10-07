import { db } from "@/lib/db";
import { toReflectionQuoteDto } from "@/lib/weekly-reflection-config-server";
import { WeeklyReflectionShell, weeklyReflectionAdminGate } from "@/lib/weekly-reflection-page";
import { WeeklyReflectionQuotes } from "@/components/admin/weekly-reflection-quotes";

/** Weekly Reflection, quote pool: add, edit and retire quotes, and see which have been used. */
export default async function AdminWeeklyReflectionQuotesPage() {
  const forbidden = await weeklyReflectionAdminGate();
  if (forbidden) return forbidden;

  const quotes = await db.reflectionQuote.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });

  return (
    <WeeklyReflectionShell
      current="/admin/weekly-reflection/quotes"
      description="The quotes the weekly post draws from. Each has its own reflection prompt."
    >
      <WeeklyReflectionQuotes quotes={quotes.map(toReflectionQuoteDto)} />
    </WeeklyReflectionShell>
  );
}
