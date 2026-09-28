import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBroadcastEmailSettings } from "@/lib/settings";
import { BroadcastEmailSettingsForm } from "@/components/admin/broadcast-email-settings-form";

/**
 * Central place to manage NASIHA's outbound email volume as Resend's daily
 * send quota is fixed but membership (and so per-send recipient counts)
 * keeps growing. Currently just the two "email every member" broadcasts —
 * Board Announcements and Event Announcements — since those are the sends
 * that scale directly with membership size and can exhaust the quota in one
 * click; every other email in the app is 1:1 with a single user action and
 * doesn't have that failure mode. Room to add more switches here later
 * (e.g. survey invites) without needing a new page.
 */
export default async function AdminEmailNotificationsPage() {
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

  const broadcastEmailSettings = await getBroadcastEmailSettings();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Email Notifications</h1>
        <p className="text-muted-foreground">
          Control which automated sends go out by email versus staying in-app only.
        </p>
      </div>

      <BroadcastEmailSettingsForm
        initialAnnouncementEmail={broadcastEmailSettings.announcementEmailEnabled}
        initialEventAnnouncementEmail={broadcastEmailSettings.eventAnnouncementEmailEnabled}
      />
    </main>
  );
}
