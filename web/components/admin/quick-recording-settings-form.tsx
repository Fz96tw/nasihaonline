"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/csrf-client";

export function QuickRecordingSettingsForm({ currentMaxDurationSeconds }: { currentMaxDurationSeconds: number }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(String(currentMaxDurationSeconds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(seconds);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 3600;

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ quickRecordingMaxDurationSeconds: parsed }),
      });
      if (!res.ok) throw new Error("Failed to update the quick recording time limit");
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Quick Recording Time Limit</h2>
        <p className="text-sm text-muted-foreground">
          Maximum length, in seconds, of a one-click quick recording before it auto-stops.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={1}
          max={3600}
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          className="w-32"
        />
        <Button onClick={save} disabled={saving || !valid || parsed === currentMaxDurationSeconds}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
