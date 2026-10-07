"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";
import type { WeeklyDigestPreview } from "@/lib/weekly-digest-job";

type Outcome = { kind: "info" | "error"; text: string; announcementId?: string };

/**
 * Preview and "Generate now" for the weekly digest. Both use the saved
 * settings (save first to try a change). Preview creates nothing; Generate
 * now makes this week's digest as a draft or published per the auto-publish
 * setting, and the server refuses a second one for the same week.
 */
export function WeeklyDigestActions({ autoPublish }: { autoPublish: boolean }) {
  const [preview, setPreview] = useState<WeeklyDigestPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "generate" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function post(url: string) {
    const csrfToken = await getCsrfToken();
    return fetch(url, { method: "POST", headers: { "x-csrf-token": csrfToken } });
  }

  async function runPreview() {
    setBusy("preview");
    setOutcome(null);
    try {
      const res = await post("/api/admin/weekly-digest/preview");
      if (!res.ok) throw new Error();
      setPreview((await res.json()) as WeeklyDigestPreview);
    } catch {
      setOutcome({ kind: "error", text: "Couldn't load the preview. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    const what = autoPublish
      ? "This publishes the digest to the feed right away."
      : "This saves it as a draft for you to review and publish.";
    if (!window.confirm(`Generate this week's digest now? ${what}`)) return;

    setBusy("generate");
    setOutcome(null);
    try {
      const res = await post("/api/admin/weekly-digest/generate");
      const payload = await res.json().catch(() => null);
      if (res.status === 409) {
        setOutcome({ kind: "error", text: "This week's digest has already been generated.", announcementId: payload?.announcementId });
      } else if (!res.ok) {
        throw new Error();
      } else if (payload.status === "quiet") {
        setOutcome({ kind: "info", text: "Nothing to report this week, so no digest was created." });
      } else {
        setOutcome({
          kind: "info",
          text: payload.published ? "Digest published to the feed." : "Digest saved as a draft.",
          announcementId: payload.announcementId,
        });
      }
    } catch {
      setOutcome({ kind: "error", text: "Couldn't generate the digest. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const announcementLink = (id: string) =>
    autoPublish ? `/whats-new/announcements/${id}` : `/admin/announcements/drafts/${id}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview &amp; generate</CardTitle>
        <CardDescription>
          Uses the settings as last saved. Preview shows what this week&apos;s digest and the inactive-member
          email would say, without creating anything. Generate now makes this week&apos;s digest immediately —
          useful to test, or if a scheduled run was missed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={runPreview} disabled={busy !== null}>
            {busy === "preview" ? "Loading…" : "Preview this week's digest"}
          </Button>
          <Button onClick={generate} disabled={busy !== null}>
            {busy === "generate" ? "Generating…" : "Generate now"}
          </Button>
        </div>

        {outcome && (
          <p className={outcome.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {outcome.text}{" "}
            {outcome.announcementId && (
              <Link href={announcementLink(outcome.announcementId)} className="underline">
                View it
              </Link>
            )}
          </p>
        )}

        {preview?.quiet && (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            Nothing to report right now, so no digest or email would be sent.
          </p>
        )}

        {preview && !preview.quiet && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 text-sm font-medium">Feed post</p>
              <div className="rounded-md border p-4">
                <p className="font-semibold">{preview.title}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{preview.body}</p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Email to inactive members</p>
              <div className="rounded-md border p-4 text-sm">
                <p className="font-semibold">Subject: {preview.email.subject}</p>
                {preview.email.introParagraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-2">
                    {paragraph}
                  </p>
                ))}
                <ul className="mt-2 list-disc pl-5">
                  {preview.email.highlightLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {preview.email.titlesLine && <p className="mt-2">{preview.email.titlesLine}</p>}
                <p className="mt-2 text-muted-foreground">[Visit NASIHA] · link to the full update · unsubscribe link</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
