"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BodyFont, HeadingFont } from "@/lib/generated/prisma/enums";
import { BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/fonts";
import { getCsrfToken } from "@/lib/csrf-client";

export function FontSettingsForm({
  currentBodyFont,
  currentHeadingFont,
}: {
  currentBodyFont: BodyFont;
  currentHeadingFont: HeadingFont;
}) {
  const router = useRouter();
  const [bodyFont, setBodyFont] = useState<BodyFont>(currentBodyFont);
  const [headingFont, setHeadingFont] = useState<HeadingFont>(currentHeadingFont);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = bodyFont !== currentBodyFont || headingFont !== currentHeadingFont;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ bodyFont, headingFont }),
      });
      if (!res.ok) throw new Error("Failed to update fonts");
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
        <h2 className="text-lg font-semibold">Typography</h2>
        <p className="text-sm text-muted-foreground">
          Body and heading fonts used across the site.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Body font</span>
          <Select value={bodyFont} onValueChange={(value) => setBodyFont(value as BodyFont)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(BodyFont).map((value) => (
                <SelectItem key={value} value={value}>
                  {BODY_FONT_OPTIONS[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Heading font</span>
          <Select value={headingFont} onValueChange={(value) => setHeadingFont(value as HeadingFont)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(HeadingFont).map((value) => (
                <SelectItem key={value} value={value}>
                  {HEADING_FONT_OPTIONS[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
