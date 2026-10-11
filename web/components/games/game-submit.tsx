"use client";

import { Loader2, Trophy } from "lucide-react";
import { getCsrfToken } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

/** What the game-over screen says about the score's trip to the board. */
export type SubmitState =
  | { kind: "not-member"; signedIn: boolean }
  | { kind: "saving" }
  | { kind: "saved"; newBest: boolean; weeklyRank: number | null }
  | { kind: "error"; message: string };

export async function postJson(url: string, method: "POST" | "PATCH", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": await getCsrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't reach the leaderboard.");
  return data;
}

export function SubmitStatus({ state }: { state: SubmitState }) {
  const className = "flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs";
  switch (state.kind) {
    case "saving":
      return (
        <p className={className}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting to the leaderboard…
        </p>
      );
    case "saved":
      return (
        <p className={className}>
          <Trophy className="h-3.5 w-3.5 text-amber-300" />
          {state.weeklyRank ? `You're #${state.weeklyRank} this week` : "Score saved"}
        </p>
      );
    case "error":
      return <p className={cn(className, "text-rose-200")}>Score not saved: {state.message}</p>;
    case "not-member":
      return (
        <p className={cn(className, "text-white/80")}>
          {state.signedIn ? "Scores are ranked for members only." : "Sign in to put your score on the board."}
        </p>
      );
  }
}
