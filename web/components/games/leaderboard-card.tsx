"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameLeaderboard } from "@/lib/games";
import { cn } from "@/lib/utils";

/** Weekly board + the viewer's standing + the all-time record, shared by every /games/* page. */
export function LeaderboardCard({ board, title }: { board: GameLeaderboard; title: string }) {
  const { record, me } = board;
  return (
  <Card className="w-full lg:max-w-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-lg">
        <Trophy className="h-5 w-5 text-amber-500" /> {title}
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
            All-time record: {record.score} by {record.name}
            {record.detail ? ` (${record.detail})` : ""}
          </p>
        )}
      </div>
    </CardContent>
  </Card>
  );
}
