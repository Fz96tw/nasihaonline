"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";

type Props = {
  initialInFeed: boolean;
  initialNotify: boolean;
  initialEmail: boolean;
};

export function WelcomeAnnouncementSettingsForm({ initialInFeed, initialNotify, initialEmail }: Props) {
  const router = useRouter();
  const [inFeed, setInFeed] = useState(initialInFeed);
  const [notify, setNotify] = useState(initialNotify);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = inFeed !== initialInFeed || notify !== initialNotify || email !== initialEmail;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          welcomeAnnouncementInFeed: inFeed,
          welcomeAnnouncementNotify: notify,
          welcomeAnnouncementEmail: email,
        }),
      });
      if (!res.ok) throw new Error("Failed to update welcome announcement settings");
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
        <CardTitle>New Member Welcome Shout-Out</CardTitle>
        <CardDescription>
          When a new member signs in for the first time, automatically post a community
          welcome. Choose which channels it goes out on — turn all three off to disable it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">What&rsquo;s New feed</p>
            <p className="text-sm text-muted-foreground">Show the welcome post in the community feed.</p>
          </div>
          <Switch checked={inFeed} onCheckedChange={setInFeed} />
        </div>
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">In-app notification</p>
            <p className="text-sm text-muted-foreground">Notify existing members via the bell icon.</p>
          </div>
          <Switch checked={notify} onCheckedChange={setNotify} />
        </div>
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Email blast</p>
            <p className="text-sm text-muted-foreground">Email existing members about the new member.</p>
          </div>
          <Switch checked={email} onCheckedChange={setEmail} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={save} disabled={saving || !dirty} className="self-start">
          {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
