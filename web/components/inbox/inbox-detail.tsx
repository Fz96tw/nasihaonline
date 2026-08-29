"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { type InboxThread, type InboxThreadMessage } from "@/lib/inbox";
import { getCsrfToken } from "@/lib/csrf-client";
import { linkifyText } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { usePasteImageUpload } from "@/lib/use-paste-image-upload";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Mirrors editInboxMessage's EDIT_WINDOW_MS (lib/inbox-server.ts) — client-side only gates whether the Edit affordance shows; the server is the real enforcement point. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

function MessageBubble({
  message,
  onEdited,
}: {
  message: InboxThreadMessage;
  onEdited: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCaret = useCallback((markdown: string) => {
    setEditBody((current) => {
      const caret = editTextareaRef.current?.selectionStart ?? current.length;
      return `${current.slice(0, caret)}${markdown}${current.slice(caret)}`;
    });
  }, []);

  const pasteImage = usePasteImageUpload({
    uploadUrl: "/api/inbox/message-image",
    value: editBody,
    onInserted: insertAtCaret,
  });

  const canEdit = message.isOwn && Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

  async function handleSaveEdit() {
    if (!editBody.trim()) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/inbox/messages/${message.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setEditing(false);
      await onEdited();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-[10px] border p-3",
        message.isOwn ? "ml-auto bg-primary/10" : "bg-muted/40",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-medium">{message.senderName}</span>
        <span>
          {formatTimestamp(message.createdAt)}
          {message.editedAt && <span className="ml-1">· edited</span>}
        </span>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={3}
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            onPaste={pasteImage.onPaste}
            ref={editTextareaRef}
            autoFocus
          />
          {pasteImage.uploading && <p className="text-xs text-muted-foreground">Uploading image…</p>}
          {pasteImage.error && <p className="text-xs text-destructive">{pasteImage.error}</p>}
          {editError && <p className="text-xs text-destructive">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={editSubmitting || pasteImage.uploading || !editBody.trim()}
              onClick={handleSaveEdit}
            >
              {editSubmitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm">{linkifyText(message.body)}</p>
          {canEdit && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setEditBody(message.body);
                setEditError(null);
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function InboxDetail({
  thread,
  isLoading,
  onBack,
  onThreadChanged,
}: {
  thread: InboxThread | undefined;
  isLoading: boolean;
  onBack: () => void;
  onThreadChanged: () => Promise<unknown>;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCaret = useCallback((markdown: string) => {
    setBody((current) => {
      const caret = textareaRef.current?.selectionStart ?? current.length;
      return `${current.slice(0, caret)}${markdown}${current.slice(caret)}`;
    });
  }, []);

  const pasteImage = usePasteImageUpload({
    uploadUrl: "/api/inbox/message-image",
    value: body,
    onInserted: insertAtCaret,
  });

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
      await onThreadChanged();
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
          <MessageBubble key={message.id} message={message} onEdited={onThreadChanged} />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t p-4">
        <Textarea
          rows={3}
          placeholder="Write a reply…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onPaste={pasteImage.onPaste}
          ref={textareaRef}
        />
        {pasteImage.uploading && <p className="text-xs text-muted-foreground">Uploading image…</p>}
        {pasteImage.error && <p className="text-sm text-destructive">{pasteImage.error}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="self-end"
          disabled={submitting || pasteImage.uploading || !body.trim()}
          onClick={handleReply}
        >
          {submitting ? "Sending…" : "Reply"}
        </Button>
      </div>
    </div>
  );
}
