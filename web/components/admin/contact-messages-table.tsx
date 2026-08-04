"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTACT_SERVICE_LABELS } from "@/lib/validation/contact";
import type { ContactMessageView } from "@/lib/contact";
import { formatAdminAction, type AdminActionLogEntryView } from "@/lib/audit";
import { getCsrfToken } from "@/lib/csrf-client";

type DialogState = { messageId: string; kind: "read" | "reply" } | null;

function historyLine(entry: AdminActionLogEntryView) {
  const who = entry.actor.name ?? entry.actor.email;
  const when = new Date(entry.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const detail =
    entry.action === "contact_message.read"
      ? (entry.metadata?.note as string | undefined)
      : (entry.metadata?.body as string | undefined);
  return `${who} — ${formatAdminAction(entry.action)}${detail ? `: "${detail}"` : ""} — ${when}`;
}

export function ContactMessagesTable({
  initialMessages,
  initialHistory,
}: {
  initialMessages: ContactMessageView[];
  initialHistory: Record<string, AdminActionLogEntryView[]>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [history, setHistory] = useState(initialHistory);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [inputValue, setInputValue] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openDialog(messageId: string, kind: "read" | "reply") {
    setDialog({ messageId, kind });
    setInputValue("");
    setError(null);
  }

  async function submit() {
    if (!dialog) return;
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setPendingId(dialog.messageId);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const body =
        dialog.kind === "read" ? { action: "read", note: trimmed } : { action: "reply", body: trimmed };
      const res = await fetch(`/api/admin/contact-messages/${dialog.messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }

      const updated = payload.message as { readAt: string | null };
      setMessages((current) =>
        current.map((message) =>
          message.id === dialog.messageId ? { ...message, readAt: updated.readAt } : message,
        ),
      );
      setHistory((current) => ({
        ...current,
        [dialog.messageId]: [
          ...(current[dialog.messageId] ?? []),
          {
            id: `local-${Date.now()}`,
            action: dialog.kind === "read" ? "contact_message.read" : "contact_message.replied",
            createdAt: new Date().toISOString(),
            actor: { name: "You", email: "" },
            metadata: dialog.kind === "read" ? { note: trimmed } : { body: trimmed },
          },
        ],
      }));
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Services</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No messages yet.
                </TableCell>
              </TableRow>
            )}
            {messages.map((message) => (
              <TableRow key={message.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(message.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{message.name}</span>
                      {!message.readAt && (
                        <Badge variant="info" className="shrink-0 whitespace-nowrap">
                          New
                        </Badge>
                      )}
                    </div>
                    <a
                      href={`mailto:${message.email}`}
                      className="text-xs text-muted-foreground underline underline-offset-2"
                    >
                      {message.email}
                    </a>
                  </div>
                </TableCell>
                <TableCell className="max-w-[160px] text-muted-foreground">
                  {message.services.length
                    ? message.services.map((service) => CONTACT_SERVICE_LABELS[service]).join(", ")
                    : "—"}
                </TableCell>
                <TableCell className="max-w-xs">{message.subject}</TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap text-muted-foreground">
                  <div className="flex flex-col gap-2">
                    {message.message}
                    {(history[message.id] ?? []).length > 0 && (
                      <div className="flex flex-col gap-1 rounded-[10px] border bg-muted/40 p-2 text-xs">
                        {(history[message.id] ?? []).map((entry) => (
                          <span key={entry.id}>{historyLine(entry)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    {!message.readAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === message.id}
                        onClick={() => openDialog(message.id, "read")}
                      >
                        Mark as read
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendingId === message.id}
                      onClick={() => openDialog(message.id, "reply")}
                    >
                      Reply
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.kind === "read" ? "Mark as read" : "Reply to message"}</DialogTitle>
            <DialogDescription>
              {dialog?.kind === "read"
                ? "Add a short note explaining why this doesn't need a reply (e.g. spam, handled by phone). Visible to other admins."
                : "This sends a real email to the sender and marks the message as read. Visible to other admins."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder={dialog?.kind === "read" ? "Why no reply is needed…" : "Your reply…"}
            rows={5}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!inputValue.trim() || pendingId !== null}>
              {dialog?.kind === "read" ? "Mark as read" : "Send reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
