"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";
import type { ReflectionNextDto, ReflectionQuoteDto } from "@/lib/weekly-reflection-config";

type Outcome = { kind: "info" | "error"; text: string; href?: string };

/**
 * Preview of the quote that will be posted next, with Skip / Swap, plus
 * "Post now". The preview comes from the same resolver the poster uses, so it
 * is exactly what the next post will contain.
 */
export function WeeklyReflectionNext({
  next,
  activeQuotes,
  postedThisWeek,
}: {
  next: ReflectionNextDto;
  activeQuotes: ReflectionQuoteDto[];
  postedThisWeek: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [swapTo, setSwapTo] = useState<string>("");
  // Set when this week's reflection already exists: what the admin can do about it.
  const [choice, setChoice] = useState<{ replyCount: number; hasCurrent: boolean } | null>(null);

  async function send(url: string, body: unknown, method = "POST") {
    const csrfToken = await getCsrfToken();
    return fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body),
    });
  }

  async function nextAction(action: "skip" | "swap" | "clear") {
    setBusy(action);
    setOutcome(null);
    try {
      const res = await send("/api/admin/weekly-reflection/next", action === "swap" ? { action, quoteId: swapTo } : { action });
      if (!res.ok) throw new Error();
      setSwapTo("");
      router.refresh();
    } catch {
      setOutcome({ kind: "error", text: "Couldn't update the next quote. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const POST_URL = "/api/admin/weekly-reflection/post";

  /** body {} posts if the week has none yet; {override:true} adds another; {replace:true} replaces the earlier one. */
  async function submit(body: { override?: boolean; replace?: boolean }) {
    setBusy("post");
    setOutcome(null);
    try {
      const res = await send(POST_URL, body);
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.status === "posted") {
        setOutcome({
          kind: "info",
          text: payload.replacedThreadId
            ? "Posted. The earlier reflection was removed from the feed and forum."
            : "Posted to the Weekly Reflection forum.",
          href: `/forums/weekly-reflection/${payload.threadId}`,
        });
        router.refresh();
      } else if (res.status === 409 && payload?.status === "already-posted") {
        setChoice({ replyCount: payload.current?.replyCount ?? 0, hasCurrent: !!payload.current });
      } else if (res.status === 409 && payload?.status === "replace-blocked") {
        setOutcome({ kind: "error", text: payload.error });
      } else if (res.status === 422) {
        setOutcome({ kind: "error", text: "Nothing was posted: the forum, the system user or an active quote is missing." });
      } else {
        throw new Error();
      }
    } catch {
      setOutcome({ kind: "error", text: "Couldn't post. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function postNow() {
    if (!next) return;
    if (!window.confirm("Post the next reflection to the Weekly Reflection forum now? Members will see it right away.")) return;
    await submit({});
  }

  const swapChoices = activeQuotes.filter((quote) => quote.id !== next?.quote.id);

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Next reflection</CardTitle>
        <CardDescription>
          {postedThisWeek ? "This week's reflection is already up. This is the quote for the next one." : "This is what the next scheduled post will contain."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {next ? (
          <div className="flex flex-col gap-2 rounded-md border p-4">
            <p className="text-base">&ldquo;{next.quote.text}&rdquo;</p>
            <p className="text-sm text-muted-foreground">
              &mdash; {next.quote.author}
              {next.quote.source ? `, ${next.quote.source}` : ""}
            </p>
            <p className="text-sm">{next.quote.prompt}</p>
            {next.via === "override" && <Badge className="w-fit">Chosen by an admin</Badge>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">There are no active quotes, so nothing can be posted. Add or reactivate one below.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={!next || busy !== null} onClick={() => nextAction("skip")}>
            {busy === "skip" ? "Skipping…" : "Skip this quote"}
          </Button>
          {next?.via === "override" && (
            <Button variant="outline" disabled={busy !== null} onClick={() => nextAction("clear")}>
              Use normal rotation
            </Button>
          )}
          <Select value={swapTo} onValueChange={setSwapTo}>
            <SelectTrigger className="w-64" aria-label="Quote to post instead">
              <SelectValue placeholder="Swap in a different quote…" />
            </SelectTrigger>
            <SelectContent>
              {swapChoices.map((quote) => (
                <SelectItem key={quote.id} value={quote.id}>
                  {quote.author}: {quote.text.length > 50 ? `${quote.text.slice(0, 50)}…` : quote.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!swapTo || busy !== null} onClick={() => nextAction("swap")}>
            {busy === "swap" ? "Swapping…" : "Swap"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Skipping moves a quote to the back of the line without counting it as posted.</p>

        <div className="flex flex-col gap-2 border-t pt-4">
          <div>
            <Button disabled={!next || busy !== null} onClick={postNow}>
              {busy === "post" ? "Posting…" : "Post now"}
            </Button>
          </div>
          {outcome && (
            <p className={`text-sm ${outcome.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {outcome.text}{" "}
              {outcome.href && (
                <Link href={outcome.href} className="underline">
                  View thread
                </Link>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>

    <AlertDialog open={choice !== null} onOpenChange={(open) => !open && setChoice(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This week&apos;s reflection is already up</AlertDialogTitle>
          <AlertDialogDescription>
            {choice?.hasCurrent
              ? choice.replyCount === 0
                ? "Nobody has replied to it yet. You can replace it, which removes it from the feed, the forum and search, or add another alongside it (the current one is unpinned but stays visible)."
                : `Members have replied to it (${choice.replyCount}), so it can't be replaced without hiding their comments. You can add another alongside it; the current one is unpinned but stays visible.`
              : "Its thread was removed. You can post a new one."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setChoice(null)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setChoice(null);
              void submit({ override: true });
            }}
          >
            {choice?.hasCurrent ? "Add another" : "Post a new one"}
          </Button>
          {choice?.hasCurrent && (
            <Button
              disabled={choice.replyCount > 0}
              title={choice.replyCount > 0 ? "Not available: members have replied" : undefined}
              onClick={() => {
                setChoice(null);
                void submit({ replace: true });
              }}
            >
              Replace this week&apos;s
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
