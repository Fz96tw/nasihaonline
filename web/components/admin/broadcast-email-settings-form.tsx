"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";

type Props = {
  initialAnnouncementEmail: boolean;
  initialEventAnnouncementEmail: boolean;
};

/**
 * Site-wide kill switches for the two "email every member" broadcast sends
 * (SiteSettings.announcementEmailEnabled / .eventAnnouncementEmailEnabled —
 * see that schema comment for why: Resend's daily send quota is small
 * enough that one announcement or public event, past a couple hundred
 * members, can exhaust it by itself). Turning a switch off doesn't touch
 * the in-app feed/bell notification for that channel, only the email leg —
 * and it overrides any per-send "Send email" checkbox an admin/host picks
 * when composing one, rather than replacing it.
 */
export function BroadcastEmailSettingsForm({
  initialAnnouncementEmail,
  initialEventAnnouncementEmail,
}: Props) {
  const router = useRouter();
  const [announcementEmail, setAnnouncementEmail] = useState(initialAnnouncementEmail);
  const [eventAnnouncementEmail, setEventAnnouncementEmail] = useState(initialEventAnnouncementEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    announcementEmail !== initialAnnouncementEmail ||
    eventAnnouncementEmail !== initialEventAnnouncementEmail;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          announcementEmailEnabled: announcementEmail,
          eventAnnouncementEmailEnabled: eventAnnouncementEmail,
        }),
      });
      if (!res.ok) throw new Error("Failed to update email notification settings");
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast emails</CardTitle>
        <CardDescription>
          These two sends go to every member at once, which can exhaust the daily email
          quota by itself as membership grows. Turning a switch off keeps the feed post
          and bell notification but skips the email — it overrides the per-send &ldquo;Send
          email&rdquo; checkbox on the compose form.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Board Announcements</p>
            <p className="text-sm text-muted-foreground">
              Email every member when the Board sends an announcement.
            </p>
          </div>
          <Switch checked={announcementEmail} onCheckedChange={setAnnouncementEmail} />
        </div>
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Event Announcements</p>
            <p className="text-sm text-muted-foreground">
              Email every member when a host publishes or resends a public event.
            </p>
          </div>
          <Switch checked={eventAnnouncementEmail} onCheckedChange={setEventAnnouncementEmail} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={save} disabled={saving || !dirty} className="self-start">
          {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
