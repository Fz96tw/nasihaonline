"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { type InboxThread } from "@/lib/inbox";
import { getCsrfToken } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InboxDetail({
  thread,
  isLoading,
  onBack,
  onReplySent,
}: {
  thread: InboxThread | undefined;
  isLoading: boolean;
  onBack: () => void;
  onReplySent: () => Promise<unknown>;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!thread) {
    return (
      <p className="hidden h-full items-center justify-center p-6 text-center text-sm text-muted-foreground sm:flex">
        Select a message to read it.
      </p>
    );
  }

  async function handleReply() {
    if (!thread || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/inbox/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ recipientId: null, subject: null, body: body.trim(), parentId: thread.id }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setBody("");
      await onReplySent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar name={thread.otherPartyName} src={thread.otherPartyAvatarUrl} size="sm" className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{thread.subject ?? thread.otherPartyName}</div>
          <div className="truncate text-xs text-muted-foreground">with {thread.otherPartyName}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {thread.messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[85%] rounded-[10px] border p-3",
              message.isOwn ? "ml-auto bg-primary/10" : "bg-muted/40",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-medium">{message.senderName}</span>
              <span>{formatTimestamp(message.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t p-4">
        <Textarea
          rows={3}
          placeholder="Write a reply…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="self-end" disabled={submitting || !body.trim()} onClick={handleReply}>
          {submitting ? "Sending…" : "Reply"}
        </Button>
      </div>
    </div>
  );
}
