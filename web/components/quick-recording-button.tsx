"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * "Record a quick video" entry point (Quick Video Recording & Sharing
 * initiative) — creates the solo quick-recording MeetingRequest with no
 * naming prompt (see createQuickRecordingMeetingRequest) and routes
 * straight into the meeting screen, so starting a recording stays one
 * click. Rendered on the Dashboard (quick-actions-widget.tsx) and in the
 * Forums area (app/(member)/forums/page.tsx) — each site supplies its own
 * markup via `children`/`className` since the two surfaces look nothing
 * alike (a list item vs. a hero CTA button).
 */
export function QuickRecordingButton({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/quick-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Couldn't start a quick recording. Please try again.");
      const data: { id: string } = await res.json();
      router.push(`/meet/quick/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start a quick recording. Please try again.");
      setPending(false);
    }
  }

  return (
    <Fragment>
      <button type="button" onClick={start} disabled={pending} className={className}>
        {children}
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </Fragment>
  );
}
