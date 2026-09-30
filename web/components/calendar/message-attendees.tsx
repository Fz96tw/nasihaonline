"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCsrfToken } from "@/lib/csrf-client";
import { formatTimestamp } from "@/lib/format-date";
import type { EventAttendeeMessageItem } from "@/lib/events";

/**
 * Host/admin-facing "Message attendees" (event detail page) — rendered below
 * ResendNotifications for any still-live event (EventDetail gates on
 * `canEdit`, mirroring messageEventAttendees' own server-side checks). Emails
 * a host-written subject/body to going-RSVP'd members plus registered guests
 * and appends the send to the history below without a page refresh.
 */
export function MessageAttendees({
  eventId,
  memberCount,
  guestCount,
  initialMessages,
}: {
  eventId: string;
  memberCount: number;
  guestCount: number;
  initialMessages: EventAttendeeMessageItem[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = memberCount + guestCount;
  const canSend = !pending && total > 0 && subject.trim() !== "" && body.trim() !== "";

  async function handleSend() {
    if (!window.confirm(`Send this message to ${total} ${total === 1 ? "person" : "people"}?`)) return;

    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/message-attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ subject, body }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setMessages((prev) => [{ ...(payload as EventAttendeeMessageItem), sentByName: "You" }, ...prev]);
      setSubject("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 className="text-sm font-semibold">Message attendees</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Email everyone who RSVP&apos;d or registered for this event. Replies go straight to you.
        </p>
      </div>

      <p className="text-sm">
        Recipients: <span className="font-medium">{total}</span>{" "}
        <span className="text-muted-foreground">
          ({memberCount} {memberCount === 1 ? "member" : "members"} RSVP&apos;d, {guestCount}{" "}
          {guestCount === 1 ? "guest" : "guests"})
        </span>
      </p>

      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        maxLength={200}
        aria-label="Subject"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message"
        rows={6}
        maxLength={5000}
        aria-label="Message"
      />

      <div>
        <Button size="sm" variant="outline" disabled={!canSend} onClick={handleSend}>
          <Mail className="mr-1.5 h-4 w-4" />
          {pending ? "Sending…" : "Send message"}
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>

      <div>
        <h3 className="text-sm font-medium">Sent messages</h3>
        {messages.length > 0 ? (
          <ul className="flex flex-col divide-y text-sm">
            {messages.map((message) => (
              <li key={message.id} className="flex items-start justify-between gap-3 py-2 text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{message.subject}</span> · by {message.sentByName} to{" "}
                  {message.recipientCount} {message.recipientCount === 1 ? "recipient" : "recipients"}
                </span>
                <span className="shrink-0">{formatTimestamp(message.sentAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No messages sent yet.</p>
        )}
      </div>
    </div>
  );
}
