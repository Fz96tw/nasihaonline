import Link from "next/link";
import { db } from "@/lib/db";
import { getWeeklyReflectionSettings } from "@/lib/settings";
import { resolveNextReflectionQuote } from "@/lib/reflection-quotes-server";
import { reflectionImageUrl } from "@/lib/reflection-images";
import { listReflectionImageFiles, resolveNextReflectionImage } from "@/lib/reflection-images-server";
import { buildReflectionValues } from "@/lib/reflection-template";
import { isoWeekKey } from "@/lib/reflection-schedule";
import { toReflectionQuoteDto } from "@/lib/weekly-reflection-config-server";
import { WeeklyReflectionShell, weeklyReflectionAdminGate } from "@/lib/weekly-reflection-page";
import { WeeklyReflectionSettingsForm } from "@/components/admin/weekly-reflection-settings-form";
import { WeeklyReflectionNext } from "@/components/admin/weekly-reflection-next";

/**
 * Weekly Reflection, overview: the schedule (on/off, day, hour) and what posts
 * next (skip / swap / post now, plus its background image). Quotes and the post wording live on the
 * sibling pages. Admin-only, like the other admin pages.
 */
export default async function AdminWeeklyReflectionPage() {
  const forbidden = await weeklyReflectionAdminGate();
  if (forbidden) return forbidden;

  const [settings, next, nextImage, imageFiles, activeQuotes, postedThisWeek] = await Promise.all([
    getWeeklyReflectionSettings(),
    resolveNextReflectionQuote(),
    resolveNextReflectionImage(),
    listReflectionImageFiles(),
    db.reflectionQuote.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.reflectionPost.findUnique({ where: { weekKey: isoWeekKey(new Date()) }, select: { id: true } }),
  ]);

  return (
    <WeeklyReflectionShell
      current="/admin/weekly-reflection"
      description={
        <>
          A new quote each week, posted to the{" "}
          <Link href="/forums/weekly-reflection" className="underline">
            Weekly Reflection forum
          </Link>{" "}
          with a prompt for members to reflect on and discuss.
        </>
      }
    >
      <WeeklyReflectionSettingsForm
        initial={{
          weeklyReflectionEnabled: settings.weeklyReflectionEnabled,
          weeklyReflectionDayOfWeek: settings.weeklyReflectionDayOfWeek,
          weeklyReflectionHour: settings.weeklyReflectionHour,
        }}
      />
      <WeeklyReflectionNext
        next={next ? { quote: toReflectionQuoteDto(next.quote), via: next.via } : null}
        attribution={next ? buildReflectionValues(next.quote, new Date()).attribution : ""}
        nextImage={nextImage ? { file: nextImage.file, url: reflectionImageUrl(nextImage.file), via: nextImage.via } : null}
        images={imageFiles.map((file) => ({ file, url: reflectionImageUrl(file) }))}
        activeQuotes={activeQuotes.map(toReflectionQuoteDto)}
        postedThisWeek={postedThisWeek !== null}
      />
    </WeeklyReflectionShell>
  );
}
