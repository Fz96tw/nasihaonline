"use client";

import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeading } from "@/components/page-heading";
import { RecordingParts } from "@/components/recording-parts";
import type { RecordingViewJson } from "@/lib/recording-client";

/** "Get my recording": the fallback when the saved link is lost. Needs the code and the passcode shown when the meeting started. */
export default function RecoverPage() {
  const [code, setCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [recordings, setRecordings] = useState<RecordingViewJson[] | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setRecordings(null);
    try {
      const res = await fetch("/api/recordings/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, passcode }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) setError(typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.");
      else setRecordings(payload.recordings as RecordingViewJson[]);
    } catch {
      setError("Couldn't reach Showup. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-14">
      <BackLink />
      <div className="flex max-w-xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <PageHeading>Get my recording</PageHeading>
          <p className="text-sm text-muted-foreground">
            Enter the code you used to start the showup session and the four-word passcode shown when it started. Only the host has these.
          </p>
        </header>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-5">
          <label htmlFor="code" className="text-sm font-medium">Session code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" spellCheck={false} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <label htmlFor="passcode" className="text-sm font-medium">Passcode</label>
          <input id="passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} required autoComplete="off" spellCheck={false} placeholder="four-words-like-this" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {pending ? "Looking…" : "Find my recording"}
          </button>
        </form>
        {recordings?.map((view) => (
          <section key={view.recId} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Recording from {new Date(view.createdAt).toLocaleString()}</h2>
            <RecordingParts view={view} />
          </section>
        ))}
      </div>
    </main>
  );
}
