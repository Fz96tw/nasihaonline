"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CREDENTIALS_STORAGE_KEY, type RoomCredentials } from "@/lib/room-types";

type Mode = "start" | "join";

const WORDS = [
  "amber", "brook", "cedar", "dune", "ember", "fern", "glade", "harbor", "iris", "jade", "kelp", "lark", "maple",
  "nova", "opal", "pine", "quill", "river", "sage", "tide", "umber", "vale", "willow", "yarrow", "zephyr", "coral",
  "dawn", "flint", "grove", "haze", "ivory", "moss",
];

/** Three random words plus two digits, e.g. "cedar-tide-coral-42". A convenience only: users can type any code they like. */
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const words = [0, 1, 2].map((i) => WORDS[bytes[i] % WORDS.length]);
  return `${words.join("-")}-${String(bytes[3] % 100).padStart(2, "0")}`;
}

function RoomForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codeInUse, setCodeInUse] = useState(false);
  const [pending, setPending] = useState(false);

  const isStart = mode === "start";
  const idPrefix = `${mode}-`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCodeInUse(false);
    setPending(true);
    try {
      const res = await fetch(`/api/rooms/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.");
        setCodeInUse(isStart && payload?.codeInUse === true);
        return;
      }
      sessionStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(payload as RoomCredentials));
      router.push("/room");
    } catch {
      setError("Couldn't reach Showup. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-5">
      <div>
        <h2 className="text-lg font-semibold">{isStart ? "Start a share" : "Join with a code"}</h2>
        <p className="text-sm text-muted-foreground">
          {isStart
            ? "Pick any code, share your screen, and give the code to whoever should join."
            : "Enter the code the host gave you to join their screen share."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}code`} className="text-sm font-medium">
          Code
        </label>
        <div className="flex gap-2">
          <input
            id={`${idPrefix}code`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            minLength={6}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            placeholder={isStart ? "any string you like" : "the host's code"}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          {isStart && (
            <button
              type="button"
              onClick={() => setCode(generateCode())}
              className="shrink-0 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Random
            </button>
          )}
        </div>
        {isStart && <p className="text-xs text-muted-foreground">At least 6 characters. Anyone with the code can join.</p>}
        {!isStart && <p className="text-xs text-muted-foreground">This meeting may be recorded by the host. You&apos;ll see a banner if it is.</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}name`} className="text-sm font-medium">
          Your name
        </label>
        <input
          id={`${idPrefix}name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          autoComplete="name"
          placeholder="How others will see you"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {codeInUse && (
        <button
          type="button"
          onClick={() => {
            setCode(generateCode());
            setError(null);
            setCodeInUse(false);
          }}
          className="self-start rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Use a random code instead
        </button>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "One moment…" : isStart ? "Start sharing" : "Join"}
      </button>
    </form>
  );
}

export function LandingForms() {
  return (
    <div className="grid w-full gap-4 md:grid-cols-2">
      <RoomForm mode="start" />
      <RoomForm mode="join" />
    </div>
  );
}
