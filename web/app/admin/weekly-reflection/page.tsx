import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getWeeklyReflectionSettings } from "@/lib/settings";
import { resolveNextReflectionQuote } from "@/lib/reflection-quotes-server";
import { isoWeekKey } from "@/lib/reflection-schedule";
import type { ReflectionQuoteDto } from "@/lib/weekly-reflection-config";
import { WeeklyReflectionSettingsForm } from "@/components/admin/weekly-reflection-settings-form";
import { WeeklyReflectionNext } from "@/components/admin/weekly-reflection-next";
import { WeeklyReflectionQuotes } from "@/components/admin/weekly-reflection-quotes";

function toDto(quote: {
  id: string;
  text: string;
  author: string;
  source: string | null;
  prompt: string;
  active: boolean;
  lastPostedAt: Date | null;
  timesPosted: number;
}): ReflectionQuoteDto {
  return {
    id: quote.id,
    text: quote.text,
    author: quote.author,
    source: quote.source,
    prompt: quote.prompt,
    active: quote.active,
    lastPostedAt: quote.lastPostedAt?.toISOString() ?? null,
    timesPosted: quote.timesPosted,
  };
}

/**
 * Admin controls for the Weekly Reflection forum thread: the schedule, the next
 * quote (skip/swap/post now), and the quote pool. Admin-only, like the other
 * admin settings pages. See lib/weekly-reflection-post.ts for the posting itself.
 */
export default async function AdminWeeklyReflectionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const [settings, next, quotes, postedThisWeek] = await Promise.all([
    getWeeklyReflectionSettings(),
    resolveNextReflectionQuote(),
    db.reflectionQuote.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
    db.reflectionPost.findUnique({ where: { weekKey: isoWeekKey(new Date()) }, select: { id: true } }),
  ]);
  const quoteDtos = quotes.map(toDto);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Weekly Reflection</h1>
        <p className="text-muted-foreground">
          A new quote each week, posted to the{" "}
          <Link href="/forums/weekly-reflection" className="underline">
            Weekly Reflection forum
          </Link>{" "}
          with a prompt for members to reflect on and discuss.
        </p>
      </div>

      <WeeklyReflectionSettingsForm
        initial={{
          weeklyReflectionEnabled: settings.weeklyReflectionEnabled,
          weeklyReflectionDayOfWeek: settings.weeklyReflectionDayOfWeek,
          weeklyReflectionHour: settings.weeklyReflectionHour,
        }}
      />
      <WeeklyReflectionNext
        next={next ? { quote: toDto(next.quote), via: next.via } : null}
        activeQuotes={quoteDtos.filter((quote) => quote.active)}
        postedThisWeek={postedThisWeek !== null}
      />
      <WeeklyReflectionQuotes quotes={quoteDtos} />
    </main>
  );
}
