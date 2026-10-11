"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, RotateCcw, Trophy } from "lucide-react";
import { LeaderboardCard } from "@/components/games/leaderboard-card";
import { SubmitStatus, postJson, type SubmitState } from "@/components/games/game-submit";
import { Button } from "@/components/ui/button";
import { Game2048, SIZE, WIN_VALUE, seedFromString, type Direction, type TileView } from "@/lib/game-2048";
import type { GameLeaderboard } from "@/lib/games";
import { cn } from "@/lib/utils";
import { GARDEN_CHAIN, tileStyle } from "./garden-tiles";

type Phase = "menu" | "starting" | "playing" | "over";

const KEYS: Record<string, Direction> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "L",
  ArrowRight: "R",
  KeyW: "U",
  KeyS: "D",
  KeyA: "L",
  KeyD: "R",
};
const SWIPE_MIN_PX = 24;

// Board geometry in % of the board's width: 4 cells and 5 gaps.
const GAP = 3;
const CELL = (100 - GAP * (SIZE + 1)) / SIZE;
const cellOffset = (n: number) => `${GAP + n * (CELL + GAP)}%`;

export function Garden2048({
  initialLeaderboard,
  signedIn,
  canSubmit,
}: {
  initialLeaderboard: GameLeaderboard;
  signedIn: boolean;
  /** Admitted members only; everyone else can play but isn't ranked. */
  canSubmit: boolean;
}) {
  const gameRef = useRef<Game2048 | null>(null);
  const runIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [tiles, setTiles] = useState<TileView[]>([]);
  const [score, setScore] = useState(0);
  const [board, setBoard] = useState(initialLeaderboard);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "not-member", signedIn });
  const [rankedNote, setRankedNote] = useState<string | null>(null);
  const [forestToast, setForestToast] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;

  /**
   * Sends the finished (or abandoned-with-progress) game for server replay.
   * Takes the run id/moves as arguments so starting a new game right after
   * can't swap them out from under the request.
   */
  const submitRun = useCallback(async (runId: string | null, game: Game2048, showResult: boolean) => {
    if (!runId || game.moves.length === 0) return;
    const previousBest = boardRef.current.me?.allTimeBest ?? null;
    if (showResult) setSubmit({ kind: "saving" });
    try {
      const { leaderboard } = (await postJson(`/api/games/2048/runs/${runId}`, "PATCH", { moves: game.moves })) as {
        leaderboard: GameLeaderboard;
      };
      setBoard(leaderboard);
      if (showResult) {
        setSubmit({
          kind: "saved",
          newBest: game.score > 0 && (previousBest === null || game.score > previousBest),
          weeklyRank: leaderboard.me?.weeklyRank ?? null,
        });
      }
    } catch (error) {
      if (showResult) {
        setSubmit({ kind: "error", message: error instanceof Error ? error.message : "Couldn't save your score." });
      }
    }
  }, []);

  const startGame = useCallback(async () => {
    // Starting over mid-game still counts the game you had going.
    const previous = gameRef.current;
    if (previous && phase === "playing") void submitRun(runIdRef.current, previous, false);

    setPhase("starting");
    setSubmit({ kind: "not-member", signedIn });
    setRankedNote(null);
    setForestToast(false);
    let seed = Math.floor(Math.random() * 2 ** 32);
    runIdRef.current = null;
    if (canSubmit) {
      try {
        // The board is dealt from the run's id, which is what lets the server replay it.
        const { id } = (await postJson("/api/games/2048/runs", "POST")) as { id: string };
        runIdRef.current = id;
        seed = seedFromString(id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Couldn't reach the leaderboard.";
        setRankedNote(`This game won't be ranked: ${reason}`);
        setSubmit({ kind: "error", message: reason });
      }
    }
    const game = new Game2048(seed);
    gameRef.current = game;
    setTiles(game.views());
    setScore(0);
    setPhase("playing");
  }, [canSubmit, signedIn, phase, submitRun]);

  const move = useCallback(
    (dir: Direction) => {
      const game = gameRef.current;
      if (phase !== "playing" || !game) return;
      const hadForest = game.maxTile >= WIN_VALUE;
      if (!game.move(dir).moved) return;
      setTiles(game.views());
      setScore(game.score);
      if (!hadForest && game.maxTile >= WIN_VALUE) setForestToast(true);
      if (!game.canMove()) {
        setPhase("over");
        void submitRun(runIdRef.current, game, true);
      }
    },
    [phase, submitRun],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      const dir = KEYS[e.code];
      if (!dir || phase !== "playing") return;
      e.preventDefault();
      move(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, phase]);

  useEffect(() => {
    if (!forestToast) return;
    const timer = window.setTimeout(() => setForestToast(false), 3500);
    return () => window.clearTimeout(timer);
  }, [forestToast]);

  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <div className="mx-auto w-full max-w-[460px] shrink-0">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">Garden 2048</h1>
            <p className="text-xs text-muted-foreground">Merge matching plants to grow a forest.</p>
          </div>
          <div className="flex gap-2">
            <ScoreBox label="Score" value={score} />
            <ScoreBox label="Best" value={Math.max(board.me?.allTimeBest ?? 0, phase === "menu" ? 0 : score) || "—"} />
          </div>
        </div>

        <div
          className="relative aspect-square w-full touch-none select-none rounded-2xl bg-[#13261a] shadow-lg"
          onPointerDown={(e) => {
            swipeStart.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
            move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
          }}
          aria-label="Garden 2048 board. Use the arrow keys or swipe to move the tiles."
        >
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <div
              key={`cell-${i}`}
              className="absolute rounded-xl bg-white/[0.07]"
              style={{ left: cellOffset(i % SIZE), top: cellOffset(Math.floor(i / SIZE)), width: `${CELL}%`, height: `${CELL}%` }}
            />
          ))}
          {tiles.map((tile) => (
            <GardenTile key={tile.id} tile={tile} />
          ))}

          {forestToast && phase === "playing" && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-20 mx-auto w-max rounded-full bg-amber-400 px-4 py-1.5 text-sm font-bold text-amber-950 shadow">
              You grew a Forest! Keep going…
            </div>
          )}

          {phase !== "playing" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#0b1a10]/80 p-6 text-center text-white backdrop-blur-[2px]">
              {phase === "over" ? (
                <>
                  <h2 className="text-2xl font-extrabold">
                    {submit.kind === "saved" && submit.newBest ? "New personal best!" : "No more moves"}
                  </h2>
                  <div className="text-6xl font-extrabold tabular-nums text-amber-200">{score}</div>
                  <SubmitStatus state={submit} />
                  <Button type="button" size="lg" onClick={() => void startGame()}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Play again
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-200">Nasiha Games</p>
                  <h2 className="text-4xl font-extrabold">Garden 2048</h2>
                  <p className="max-w-[18rem] text-sm text-white/85">
                    Slide the tiles. Two of the same plant merge into the next stage. Grow a Forest!
                  </p>
                  <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/90">
                    <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-300" />
                    {board.record ? `Community record: ${board.record.score} by ${board.record.name}` : "No record yet. Set the first one!"}
                  </p>
                  <Button type="button" size="lg" onClick={() => void startGame()} disabled={phase === "starting"}>
                    {phase === "starting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Start planting
                  </Button>
                  <p className="text-[11px] text-white/60">Arrow keys / WASD, or swipe</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{rankedNote ?? "Arrow keys / WASD, or swipe on the board."}</p>
          {phase === "playing" && (
            <Button type="button" variant="outline" size="sm" onClick={() => void startGame()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> New game
            </Button>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How your garden grows</p>
          <div className="flex flex-wrap gap-1.5">
            {GARDEN_CHAIN.map((value) => {
              const style = tileStyle(value);
              const Icon = style.icon;
              return (
                <div
                  key={value}
                  title={`${style.label} (${value})`}
                  className="flex h-9 w-9 items-center justify-center rounded-md"
                  style={{ background: style.bg, color: style.fg }}
                >
                  <Icon className="h-5 w-5" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <LeaderboardCard board={board} title="This week's top gardeners" />
    </div>
  );
}

function ScoreBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-[4.5rem] rounded-lg bg-[#13261a] px-3 py-1.5 text-center text-white">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{label}</div>
      <div className="text-lg font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

function GardenTile({ tile }: { tile: TileView }) {
  const style = tileStyle(tile.value);
  const Icon = style.icon;
  return (
    <div
      className={cn(
        "absolute flex flex-col items-center justify-center rounded-xl shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-[left,top] duration-100 ease-out",
        tile.kind === "ghost" ? "z-0" : "z-10",
        tile.kind === "spawned" && "animate-tile-appear",
        tile.kind === "merged" && "animate-tile-pop",
        style.glow && "shadow-[0_0_18px_3px_rgba(245,184,46,0.6)]",
      )}
      style={{
        left: cellOffset(tile.index % SIZE),
        top: cellOffset(Math.floor(tile.index / SIZE)),
        width: `${CELL}%`,
        height: `${CELL}%`,
        background: style.bg,
        color: style.fg,
      }}
    >
      <span className="absolute left-1.5 top-1 text-[10px] font-extrabold opacity-75 sm:left-2 sm:text-xs">{tile.value}</span>
      <Icon className="h-[46%] w-[46%]" strokeWidth={2} />
      <span className="mt-0.5 hidden text-[11px] font-bold sm:block">{style.label}</span>
    </div>
  );
}
