"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Heart, Loader2, Play, RotateCcw, Trophy, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";
import type { GameLeaderboard } from "@/lib/games";
import { cn } from "@/lib/utils";
import { LOGICAL_H, LOGICAL_W, TowerEngine, type TowerSound, type TowerStats } from "./tower-engine";

const EMPTY_STATS: TowerStats = { score: 0, floors: 0, perfects: 0, combo: 0, lives: 3 };

type Phase = "menu" | "playing" | "over";

/** What the game-over screen says about the score's trip to the board. */
type SubmitState =
  | { kind: "not-member"; signedIn: boolean }
  | { kind: "saving" }
  | { kind: "saved"; newBest: boolean; weeklyRank: number | null }
  | { kind: "error"; message: string };

async function postJson(url: string, method: "POST" | "PATCH", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": await getCsrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't reach the leaderboard.");
  return data;
}

/** Tiny synthesized sound effects, so the prototype ships no audio assets. */
function useSounds(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback(
    (sound: TowerSound) => {
      if (muted) return;
      try {
        ctxRef.current ??= new AudioContext();
        const ac = ctxRef.current;
        const notes: Record<TowerSound, Array<[number, number, OscillatorType]>> = {
          drop: [[150, 0.12, "sine"]],
          perfect: [[660, 0.1, "triangle"], [990, 0.18, "triangle"]],
          miss: [[300, 0.12, "sawtooth"], [180, 0.2, "sawtooth"]],
          over: [[392, 0.18, "triangle"], [311, 0.18, "triangle"], [233, 0.4, "triangle"]],
        };
        let t = ac.currentTime;
        for (const [freq, dur, type] of notes[sound]) {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.type = type;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(sound === "miss" ? 0.06 : 0.15, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
          osc.connect(gain).connect(ac.destination);
          osc.start(t);
          osc.stop(t + dur);
          t += dur * 0.8;
        }
      } catch {
        // Web Audio unavailable — play silently.
      }
    },
    [muted],
  );
}

export function TowerGame({
  initialLeaderboard,
  signedIn,
  canSubmit,
}: {
  initialLeaderboard: GameLeaderboard;
  signedIn: boolean;
  /** Admitted members only; everyone else can play but isn't ranked. */
  canSubmit: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TowerEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [stats, setStats] = useState<TowerStats>(EMPTY_STATS);
  const [board, setBoard] = useState(initialLeaderboard);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "not-member", signedIn });
  const [muted, setMuted] = useState(false);
  // Snapshot at start: once the score is saved the board may already show it as the record.
  const [recordToBeat, setRecordToBeat] = useState(initialLeaderboard.record);
  const play = useSounds(muted);
  const playRef = useRef(play);
  playRef.current = play;

  // The run is registered with the server as the game starts, so its
  // server-side start time can vouch for the score submitted at the end.
  const runRef = useRef<Promise<string> | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const handleGameOver = useCallback(
    async (final: TowerStats) => {
      setPhase("over");
      const run = runRef.current;
      runRef.current = null;
      if (!canSubmit || !run) return;
      const previousBest = boardRef.current.me?.allTimeBest ?? null;
      setSubmit({ kind: "saving" });
      try {
        const runId = await run;
        const { leaderboard } = (await postJson(`/api/games/tower/runs/${runId}`, "PATCH", {
          score: final.score,
          floors: final.floors,
          perfects: final.perfects,
        })) as { leaderboard: GameLeaderboard };
        setBoard(leaderboard);
        setSubmit({
          kind: "saved",
          newBest: final.score > 0 && (previousBest === null || final.score > previousBest),
          weeklyRank: leaderboard.me?.weeklyRank ?? null,
        });
      } catch (error) {
        setSubmit({ kind: "error", message: error instanceof Error ? error.message : "Couldn't save your score." });
      }
    },
    [canSubmit],
  );
  const gameOverRef = useRef(handleGameOver);
  gameOverRef.current = handleGameOver;

  // Create the engine once and keep the canvas sized to its container.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;

    const engine = new TowerEngine(ctx, {
      onStats: setStats,
      onSound: (s) => playRef.current(s),
      onGameOver: (final) => void gameOverRef.current(final),
    });
    engineRef.current = engine;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      const height = (width * LOGICAL_H) / LOGICAL_W;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const scale = (width * dpr) / LOGICAL_W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      engine.draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    setSubmit({ kind: "not-member", signedIn });
    setRecordToBeat(boardRef.current.record);
    if (canSubmit) {
      const run = postJson("/api/games/tower/runs", "POST").then((data: { id: string }) => data.id);
      run.catch(() => {}); // surfaced at game over, when it's awaited
      runRef.current = run;
    }
    setPhase("playing");
    engineRef.current?.start();
  }, [canSubmit, signedIn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      if (e.target instanceof HTMLElement && e.target.closest("button, input, textarea")) return;
      e.preventDefault();
      if (phase === "playing") engineRef.current?.tap();
      else start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, start]);

  const { record, me } = board;
  const beatRecord = recordToBeat !== null && stats.score > recordToBeat.score;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <div className="mx-auto w-full max-w-[min(420px,calc((100dvh-9rem)*0.625))] shrink-0">
        <div
          ref={wrapRef}
          className="relative w-full touch-none select-none overflow-hidden rounded-xl shadow-lg ring-1 ring-black/10"
          onPointerDown={(e) => {
            if (phase !== "playing") return;
            e.preventDefault();
            engineRef.current?.tap();
          }}
        >
          <canvas ref={canvasRef} className="block" aria-label="Lantern Tower game board" />

          {/* HUD */}
          {phase === "playing" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 text-white">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Score</div>
                <div className="text-3xl font-extrabold tabular-nums drop-shadow">{stats.score}</div>
                <div className="text-xs text-white/80">{stats.floors} {stats.floors === 1 ? "floor" : "floors"}</div>
              </div>
              <div className="flex gap-1 pt-1" aria-label={`${stats.lives} lives left`}>
                {[0, 1, 2].map((i) => (
                  <Heart
                    key={i}
                    className={cn("h-5 w-5 drop-shadow", i < stats.lives ? "fill-rose-500 text-rose-500" : "text-white/40")}
                  />
                ))}
              </div>
            </div>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute bottom-2 right-2 h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          {phase === "menu" && (
            <Overlay>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Nasiha Games</p>
              <h1 className="text-4xl font-extrabold">Lantern Tower</h1>
              <p className="max-w-[16rem] text-sm text-white/80">
                Tap to drop each floor. Land it dead-center to light the lanterns gold and build a combo.
              </p>
              <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/90">
                <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-300" />
                {record ? `Community record: ${record.score} by ${record.name}` : "No record yet. Set the first one!"}
              </p>
              <Button type="button" size="lg" onClick={start}>
                <Play className="mr-2 h-4 w-4" /> Start building
              </Button>
              <p className="text-[11px] text-white/60">Tap, click, or press Space</p>
            </Overlay>
          )}

          {phase === "over" && (
            <Overlay>
              <h2 className="text-2xl font-extrabold">
                {submit.kind === "saved" && submit.newBest ? "New personal best!" : "Tower complete"}
              </h2>
              <div className="text-6xl font-extrabold tabular-nums text-amber-200">{stats.score}</div>
              <p className="text-sm text-white/80">
                {stats.floors} {stats.floors === 1 ? "floor" : "floors"} · {stats.perfects} perfect{" "}
                {stats.perfects === 1 ? "drop" : "drops"}
              </p>
              <p className="max-w-[17rem] text-sm text-white/90">
                {beatRecord
                  ? "You beat the community record. Amazing!"
                  : recordToBeat
                    ? `${recordToBeat.score - stats.score} points from the community record. One more try?`
                    : "One more try?"}
              </p>
              <SubmitStatus state={submit} />
              <Button type="button" size="lg" onClick={start}>
                <RotateCcw className="mr-2 h-4 w-4" /> Play again
              </Button>
            </Overlay>
          )}
        </div>
      </div>

      <Card className="w-full lg:max-w-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-amber-500" /> This week&apos;s top builders
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Resets in {formatDistanceToNowStrict(new Date(board.weekEndsAt))} (Monday 00:00 UTC).
          </p>
        </CardHeader>
        <CardContent>
          {board.weekly.length === 0 ? (
            <p className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
              No scores yet this week. Be the first on the board!
            </p>
          ) : (
            <ol className="space-y-1.5">
              {board.weekly.map((row) => (
                <li
                  key={row.userId}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                    row.userId === me?.userId
                      ? "bg-primary/10 font-semibold text-primary"
                      : row.rank === 1
                        ? "bg-amber-50 dark:bg-amber-950/30"
                        : "",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{row.rank}</span>
                    <Avatar name={row.name} src={row.avatarUrl} size="xs" />
                    <Link href={`/members/${row.userId}`} className="truncate hover:underline">
                      {row.name}
                    </Link>
                  </span>
                  <span className="tabular-nums">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
            {me ? (
              <>
                <p>
                  Your best this week:{" "}
                  <span className="font-semibold text-foreground">
                    {me.weeklyBest ?? "—"}
                    {me.weeklyRank ? ` (#${me.weeklyRank})` : ""}
                  </span>
                </p>
                <p>
                  All-time best: <span className="font-semibold text-foreground">{me.allTimeBest ?? "—"}</span>
                </p>
              </>
            ) : (
              <p>
                <Link href="/sign-in" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>{" "}
                to put your score on the board.
              </p>
            )}
            {record && (
              <p className="pt-2 text-xs">
                <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
                All-time record: {record.score} by {record.name} ({record.floors} floors)
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubmitStatus({ state }: { state: SubmitState }) {
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

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/55 p-6 text-center text-white backdrop-blur-[2px]">
      {children}
    </div>
  );
}
