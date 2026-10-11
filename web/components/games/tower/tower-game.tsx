"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Play, RotateCcw, Trophy, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LOGICAL_H, LOGICAL_W, TowerEngine, type TowerSound, type TowerStats } from "./tower-engine";

const BEST_STORAGE_KEY = "nasiha.tower.best";

// Prototype only: stand-in leaderboard until scores are stored server-side.
const SAMPLE_LEADERBOARD = [
  { name: "Aisha R.", score: 61 },
  { name: "Yusuf K.", score: 48 },
  { name: "Maryam S.", score: 40 },
  { name: "Omar H.", score: 33 },
  { name: "Fatima Z.", score: 27 },
  { name: "Bilal A.", score: 19 },
  { name: "Huda M.", score: 12 },
];

const EMPTY_STATS: TowerStats = { score: 0, floors: 0, perfects: 0, combo: 0, lives: 3 };

type Phase = "menu" | "playing" | "over";

function readBest() {
  try {
    return Number(window.localStorage.getItem(BEST_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(score: number) {
  try {
    window.localStorage.setItem(BEST_STORAGE_KEY, String(score));
  } catch {
    // Storage blocked (private window etc.) — best score just won't persist.
  }
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

export function TowerGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TowerEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [stats, setStats] = useState<TowerStats>(EMPTY_STATS);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [muted, setMuted] = useState(false);
  const play = useSounds(muted);
  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => setBest(readBest()), []);

  // Create the engine once and keep the canvas sized to its container.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;

    const engine = new TowerEngine(ctx, {
      onStats: setStats,
      onSound: (s) => playRef.current(s),
      onGameOver: (final) => {
        setPhase("over");
        const prev = readBest();
        if (final.score > prev) {
          writeBest(final.score);
          setBest(final.score);
          setNewBest(true);
        }
      },
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
    setNewBest(false);
    setPhase("playing");
    engineRef.current?.start();
  }, []);

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

  const record = SAMPLE_LEADERBOARD[0];
  const board = [...SAMPLE_LEADERBOARD, ...(best > 0 ? [{ name: "You", score: best }] : [])]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

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
                Record: {record.score} by {record.name}
              </p>
              <Button type="button" size="lg" onClick={start}>
                <Play className="mr-2 h-4 w-4" /> Start building
              </Button>
              <p className="text-[11px] text-white/60">Tap, click, or press Space</p>
            </Overlay>
          )}

          {phase === "over" && (
            <Overlay>
              <h2 className="text-2xl font-extrabold">{newBest ? "New personal best!" : "Tower complete"}</h2>
              <div className="text-6xl font-extrabold tabular-nums text-amber-200">{stats.score}</div>
              <p className="text-sm text-white/80">
                {stats.floors} {stats.floors === 1 ? "floor" : "floors"} · {stats.perfects} perfect {stats.perfects === 1 ? "drop" : "drops"}
              </p>
              <p className="max-w-[16rem] text-sm text-white/90">
                {stats.score > record.score
                  ? "You beat the community record. Masha'Allah!"
                  : `${record.score - stats.score} points from the community record. One more try?`}
              </p>
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
          <p className="text-xs text-muted-foreground">Prototype — sample names; your best is saved on this device only.</p>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5">
            {board.map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                  row.name === "You" ? "bg-primary/10 font-semibold text-primary" : i === 0 ? "bg-amber-50 dark:bg-amber-950/30" : "",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                  {row.name}
                </span>
                <span className="tabular-nums">{row.score}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Your best: <span className="font-semibold text-foreground">{best || "—"}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/55 p-6 text-center text-white backdrop-blur-[2px]">
      {children}
    </div>
  );
}
