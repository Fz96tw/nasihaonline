"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { createAnnouncementSchema } from "@/lib/validation/announcement";
import { getCsrfToken } from "@/lib/csrf-client";
import type { AnnouncementDraft } from "@/lib/announcements-server";

/**
 * Edit an unsent announcement draft, then save it, publish it (approve &
 * send) or discard it. Plain controlled inputs rather than react-hook-form:
 * four fields, and the same createAnnouncementSchema validates both here and
 * in PATCH /api/admin/announcements/:id.
 */
export function AnnouncementDraftEditor({ draft }: { draft: AnnouncementDraft }) {
  const router = useRouter();
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [showInFeed, setShowInFeed] = useState(draft.showInFeed);
  const [notifyInApp, setNotifyInApp] = useState(draft.notifyInApp);
  const [sendEmail, setSendEmail] = useState(draft.sendEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const values = { title, body, showInFeed, notifyInApp, sendEmail };
  const parsed = createAnnouncementSchema.safeParse(values);
  const dirty =
    title !== draft.title ||
    body !== draft.body ||
    showInFeed !== draft.showInFeed ||
    notifyInApp !== draft.notifyInApp ||
    sendEmail !== draft.sendEmail;

  async function call(url: string, method: string, json?: unknown) {
    const csrfToken = await getCsrfToken();
    const res = await fetch(url, {
      method,
      headers: { "x-csrf-token": csrfToken, ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : undefined,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.");
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the fields and try again.");
      await call(`/api/admin/announcements/${draft.id}`, "PATCH", parsed.data);
      setMessage("Draft saved.");
      router.refresh();
    });

  const publish = () =>
    run(async () => {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the fields and try again.");
      if (!window.confirm("Publish this announcement to every member now? This can't be undone or un-sent.")) return;
      if (dirty) await call(`/api/admin/announcements/${draft.id}`, "PATCH", parsed.data);
      await call(`/api/admin/announcements/${draft.id}/publish`, "POST");
      router.push("/admin/announcements");
      router.refresh();
    });

  const discard = () =>
    run(async () => {
      if (!window.confirm("Discard this draft? This can't be undone.")) return;
      await call(`/api/admin/announcements/${draft.id}`, "DELETE");
      router.push("/admin/announcements");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="draft-title" className="text-sm font-medium">
          Title
        </label>
        <Input id="draft-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="draft-body" className="text-sm font-medium">
          Message
        </label>
        <Textarea id="draft-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Deliver via</span>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showInFeed} onCheckedChange={(v) => setShowInFeed(v === true)} />
          <span>Post to feed (What&rsquo;s New)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={notifyInApp} onCheckedChange={(v) => setNotifyInApp(v === true)} />
          <span>Send bell notification</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
          <span>Send email</span>
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={publish} disabled={busy}>
          Approve &amp; publish
        </Button>
        <Button variant="outline" onClick={save} disabled={busy || !dirty}>
          Save draft
        </Button>
        <Button variant="destructive" onClick={discard} disabled={busy}>
          Discard
        </Button>
      </div>
    </div>
  );
}
