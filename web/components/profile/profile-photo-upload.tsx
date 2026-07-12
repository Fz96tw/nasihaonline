"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Uploads immediately on file selection (POST /api/profile/avatar) rather
 * than batching with the rest of the profile form — the AC requires invalid
 * type/size to surface as its own inline error next to this control, not
 * folded into the form's generic submit-error banner.
 */
export function ProfilePhotoUpload({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("File must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds the 5MB size limit.");
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set("photo", file);
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Upload failed");
      }
      setPreview(payload.profile.avatarUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/profile/avatar", {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to remove photo");
      }
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "?"} src={preview} size="xl" />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {preview ? "Change photo" : "Upload photo"}
          </Button>
          {preview && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleRemove}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Max 5MB.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
