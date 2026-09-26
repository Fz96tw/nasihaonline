"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { RecordingParts } from "@/components/recording-parts";
import { saveRecording, type RecordingViewJson } from "@/lib/recording-client";

const POLL_MS = 5000;
const GIVE_UP_MS = 15 * 60 * 1000;

type LoadState =
  | { kind: "loading" }
  | { kind: "no-secret" }
  | { kind: "not-found" }
  | { kind: "unavailable" }
  | { kind: "ok"; view: RecordingViewJson };

/**
 * The exit screen and the permanent recovery link: /recording/{recId}#{hostSecret}.
 * The secret lives in the URL fragment, which browsers never send to servers or
 * put in referrers; the page reads it and sends it as a header. Polls until the
 * recording is ready (or has failed), and remembers the link on this device.
 */
export default function RecordingPage({ params }: { params: { recId: string } }) {
  const { recId } = params;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const secretRef = useRef<string>("");
  const startedAt = useRef(Date.now());
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recordings/${recId}`, { headers: { "x-host-secret": secretRef.current }, cache: "no-store" });
      if (res.status === 404 || res.status === 429) return setState({ kind: "not-found" });
      if (!res.ok) return setState({ kind: "unavailable" });
      setState({ kind: "ok", view: (await res.json()) as RecordingViewJson });
    } catch {
      setState({ kind: "unavailable" });
    }
  }, [recId]);

  useEffect(() => {
    secretRef.current = window.location.hash.replace(/^#/, "");
    if (!secretRef.current) return setState({ kind: "no-secret" });
    saveRecording({ recId, hostSecret: secretRef.current, code: "" });
    void load();
  }, [recId, load]);

  useEffect(() => {
    if (state.kind !== "ok" || state.view.status !== "processing") return;
    if (Date.now() - startedAt.current > GIVE_UP_MS) return;
    const timer = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer);
  }, [state, load]);

  async function requestEmail(event: FormEvent) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const res = await fetch(`/api/recordings/${recId}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, hostSecret: secretRef.current }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) setEmailMsg(typeof payload?.error === "string" ? payload.error : "Couldn't queue the email.");
      else {
        setEmailMsg(payload.status === "sent" ? "Sent. Check your inbox." : "Done. We'll email the link once the recording is ready.");
        setEmail("");
        void load();
      }
    } catch {
      setEmailMsg("Couldn't reach Showup. Try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <PageHeading>Your recording</PageHeading>
        <p className="text-sm text-muted-foreground">Bookmark this page: this link is your way back to the recording for 24 hours.</p>
      </header>

      {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
      {state.kind === "no-secret" && (
        <p className="text-sm">
          This link is incomplete (it should end with <code>#…</code>). Use the full link you saved, or{" "}
          <Link href="/recover" className="underline">recover it with your code and passcode</Link>.
        </p>
      )}
      {state.kind === "not-found" && (
        <p className="text-sm">
          We couldn&apos;t find that recording. It may have expired (recordings are kept for 24 hours) or the link is wrong. You can also{" "}
          <Link href="/recover" className="underline">recover it with your code and passcode</Link>.
        </p>
      )}
      {state.kind === "unavailable" && (
        <p role="alert" className="text-sm text-destructive">
          Showup is temporarily unavailable. <button type="button" onClick={() => void load()} className="underline">Try again</button>
        </p>
      )}
      {state.kind === "ok" && (
        <>
          <RecordingParts view={state.view} />
          {state.view.emailAvailable && state.view.status !== "none" && !state.view.emailQueued && (
            <form onSubmit={requestEmail} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4">
              <label htmlFor="email" className="text-sm font-medium">Email me the link</label>
              <p className="text-xs text-muted-foreground">
                One email with this recording link, sent when the meeting has ended. We delete your address as soon as it&apos;s sent.
              </p>
              <div className="flex gap-2">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <button type="submit" disabled={emailBusy} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
                  {emailBusy ? "…" : "Send"}
                </button>
              </div>
            </form>
          )}
          {state.view.emailQueued && <p className="text-sm text-muted-foreground">An email with this link is on its way once the recording is ready.</p>}
          {emailMsg && <p className="text-sm">{emailMsg}</p>}
        </>
      )}
      <Link href="/" className="text-sm underline">Back to Showup</Link>
    </main>
  );
}
