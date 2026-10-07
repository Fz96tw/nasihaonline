"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";
import { WEEKDAY_LABELS } from "@/lib/weekly-digest-config";
import { formatHour } from "@/lib/weekly-reflection-config";

type Values = { weeklyReflectionEnabled: boolean; weeklyReflectionDayOfWeek: number; weeklyReflectionHour: number };

/** Enable switch and posting day/hour (UTC). Saved as a PATCH of only what changed; the worker reads it fresh each tick. */
export function WeeklyReflectionSettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = (Object.keys(initial) as (keyof Values)[]).filter((key) => values[key] !== initial[key]);

  async function save() {
    if (changed.length === 0) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/weekly-reflection/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(Object.fromEntries(changed.map((key) => [key, values[key]]))),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't save the schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>
          Once a week the next quote is posted to the Weekly Reflection forum. It is off until you switch it on, so review the quote pool below
          first. Changes apply at the next check (every 15 minutes); no redeploy needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Post a reflection every week</p>
            <p className="text-sm text-muted-foreground">When off, the scheduled check skips every week. &ldquo;Post now&rdquo; still works.</p>
          </div>
          <Switch
            checked={values.weeklyReflectionEnabled}
            onCheckedChange={(v) => setValues((prev) => ({ ...prev, weeklyReflectionEnabled: v }))}
            aria-label="Post a reflection every week"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(values.weeklyReflectionDayOfWeek)}
            onValueChange={(v) => setValues((prev) => ({ ...prev, weeklyReflectionDayOfWeek: Number(v) }))}
          >
            <SelectTrigger className="w-40" aria-label="Day of week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_LABELS.map((label, index) => (
                <SelectItem key={label} value={String(index)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(values.weeklyReflectionHour)}
            onValueChange={(v) => setValues((prev) => ({ ...prev, weeklyReflectionHour: Number(v) }))}
          >
            <SelectTrigger className="w-32" aria-label="Hour (UTC)">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {formatHour(hour)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">UTC</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Weeks run Monday to Sunday (UTC). If the worker is down at the chosen time it posts on its next check that same week; a missed week is
          not carried over.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && changed.length === 0 && <p className="text-sm text-muted-foreground">Saved.</p>}
        <div>
          <Button onClick={save} disabled={saving || changed.length === 0}>
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
