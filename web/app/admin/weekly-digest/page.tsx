import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getWeeklyDigestSettings } from "@/lib/settings";
import { WeeklyDigestSettingsForm } from "@/components/admin/weekly-digest-settings-form";
import { WeeklyDigestActions } from "@/components/admin/weekly-digest-actions";

/**
 * Settings for the weekly activity digest announcement — when it runs, what
 * it covers, and whether inactive members get a teaser email. See the
 * SiteSettings.weeklyDigest* schema comment.
 */
export default async function AdminWeeklyDigestPage() {
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

  const settings = await getWeeklyDigestSettings();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Weekly Digest</h1>
        <p className="text-muted-foreground">
          A weekly announcement summarizing new members, content and activity across the community.
        </p>
      </div>

      <WeeklyDigestActions autoPublish={settings.weeklyDigestAutoPublish} />
      <WeeklyDigestSettingsForm initial={settings} />
    </main>
  );
}
