"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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

const CARDS: Record<Mode, { title: string; intro: string }> = {
  start: {
    title: "Start a share",
    intro: "Pick any code, share your screen, and give the code to whoever should join.",
  },
  join: {
    title: "Join a share",
    intro: "Enter the code the host gave you to join their screen share.",
  },
};

/**
 * One of the two landing cards. Collapsed it holds just one button; once chosen
 * it expands into the form. The state lives here, so going back and choosing
 * the same card again keeps what was typed. `hidden` is the other card being
 * chosen: it stays mounted so it can animate away, but is inert meanwhile.
 */
function RoomCard({
  mode,
  selected,
  hidden,
  onSelect,
  onBack,
}: {
  mode: Mode;
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
  onBack: () => void;
}) {
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

  const card = CARDS[mode];
  // The collapsing column clips the card; on a phone the stack collapses vertically instead.
  const wrapperClass = `min-w-0 overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none ${
    hidden ? "pointer-events-none max-h-0 opacity-0 md:max-h-[60rem]" : "max-h-[60rem] opacity-100"
  }`;
  const inert = hidden ? ({ inert: "" } as object) : {};

  if (!selected) {
    return (
      <div className={wrapperClass} aria-hidden={hidden} {...inert}>
        <div className="flex h-full items-center rounded-xl border border-border bg-muted/40 p-5 md:min-w-[20rem]">
          <button
            type="button"
            id={`card-${mode}`}
            onClick={onSelect}
            className="w-full rounded-md bg-primary px-4 py-3 text-base font-medium text-primary-foreground hover:opacity-90"
          >
            {card.title}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <form onSubmit={onSubmit} className="card-in flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <div>
          <h2 className="text-lg font-semibold">{card.title}</h2>
          <p className="text-sm text-muted-foreground">{card.intro}</p>
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
              autoFocus
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

        <p className="text-xs text-muted-foreground" data-testid="recording-disclosure">
          {isStart
            ? "You can record your meeting. While it records, everyone sees a red \u201cThis meeting is being recorded\u201d banner. Recordings are deleted after 7 days."
            : "This meeting may be recorded by the host. If it is, you\u2019ll see a red banner for as long as it records. Recordings are deleted after 7 days."}
        </p>
      </form>
    </div>
  );
}

/**
 * Two cards side by side (stacked on a phone). Choosing one animates the other
 * away and expands the chosen card into its form; Back returns to both.
 */
export function LandingForms() {
  const [mode, setMode] = useState<Mode | null>(null);
  const lastMode = useRef<Mode | null>(null);

  // Back puts keyboard focus on the card that was open.
  useEffect(() => {
    if (mode === null && lastMode.current) document.getElementById(`card-${lastMode.current}`)?.focus();
    lastMode.current = mode;
  }, [mode]);

  const columns = mode === "start" ? "md:grid-cols-[1fr_0fr]" : mode === "join" ? "md:grid-cols-[0fr_1fr]" : "md:grid-cols-[1fr_1fr]";
  return (
    <div
      className={`grid w-full transition-[grid-template-columns,gap] duration-300 ease-out motion-reduce:transition-none ${columns} ${
        mode ? "gap-0" : "gap-4"
      }`}
    >
      {(["start", "join"] as const).map((card) => (
        <RoomCard
          key={card}
          mode={card}
          selected={mode === card}
          hidden={mode !== null && mode !== card}
          onSelect={() => setMode(card)}
          onBack={() => setMode(null)}
        />
      ))}
    </div>
  );
}
