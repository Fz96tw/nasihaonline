import { resolveNextReflectionQuote } from "@/lib/reflection-quotes-server";
import { getWeeklyReflectionMessage } from "@/lib/settings";
import { toReflectionQuoteDto } from "@/lib/weekly-reflection-config-server";
import { WeeklyReflectionShell, weeklyReflectionAdminGate } from "@/lib/weekly-reflection-page";
import { WeeklyReflectionMessageForm } from "@/components/admin/weekly-reflection-message-form";

/** Weekly Reflection, post message: the editable title and body wording of each weekly thread. */
export default async function AdminWeeklyReflectionMessagePage() {
  const forbidden = await weeklyReflectionAdminGate();
  if (forbidden) return forbidden;

  const [message, next] = await Promise.all([getWeeklyReflectionMessage(), resolveNextReflectionQuote()]);

  return (
    <WeeklyReflectionShell
      current="/admin/weekly-reflection/message"
      description="The wording of each weekly thread. Add your own intro or sign-off around the quote."
    >
      <WeeklyReflectionMessageForm initial={message} sampleQuote={next ? toReflectionQuoteDto(next.quote) : null} />
    </WeeklyReflectionShell>
  );
}
