"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCsrfToken } from "@/lib/csrf-client";
import { formatTimestamp } from "@/lib/format-date";
import {
  MAX_INVITES_PER_EVENT,
  MAX_INVITES_PER_HOST_PER_DAY,
  MAX_INVITES_PER_REQUEST,
} from "@/lib/event-guest-invite-limits";

interface GuestRow {
  id: string;
  email: string;
  name: string | null;
  source: "invited" | "link";
  invitedAt: string | null;
  joined: boolean;
  revoked: boolean;
}

interface GuestState {
  token: string | null;
  guests: GuestRow[];
}

type Outcome = { email: string; status: string; message?: string };

/**
 * Host/admin panel on a public (`open`) event's detail page: the private
 * guest-invite link (copy / regenerate / turn off) and email invitations to
 * non-members, with the list of who was invited or joined by link. Rendered
 * by EventDetail for `canEdit` on an upcoming, non-restricted open event;
 * all authorisation is enforced by /api/events/:id/guest-link and
 * /guest-invites, so this only reflects what the server allows.
 */
export function ManageGuestInvites({ eventId }: { eventId: string }) {
  const [state, setState] = useState<GuestState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailsText, setEmailsText] = useState("");
  const [note, setNote] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/guest-link`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't load guest invitations.");
      setState(payload as GuestState);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load guest invitations.");
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(url: string, method: string, body?: unknown) {
    const csrfToken = await getCsrfToken();
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
    return payload;
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const guestUrl = state?.token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/meet/event/${eventId}?gt=${encodeURIComponent(state.token)}`
    : null;

  function copyLink() {
    if (!guestUrl) return;
    void navigator.clipboard.writeText(guestUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function enable() {
    void run(async () => {
      await call(`/api/events/${eventId}/guest-link`, "POST", {});
      await load();
    });
  }

  function regenerate() {
    if (
      !window.confirm(
        "Generate a new link? The previous link will no longer work for anyone it was shared with, and anyone who already joined through it is removed. Guests you invited by email keep their access.",
      )
    ) {
      return;
    }
    void run(async () => {
      await call(`/api/events/${eventId}/guest-link`, "POST", { regenerate: true });
      await load();
    });
  }

  function disable() {
    if (!window.confirm("Turn off the guest link? It stops working and anyone who joined through it is removed.")) return;
    void run(async () => {
      await call(`/api/events/${eventId}/guest-link`, "DELETE");
      setOutcomes(null);
      await load();
    });
  }

  function sendInvites() {
    const emails = emailsText
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setError("Enter at least one email address.");
      return;
    }
    void run(async () => {
      const payload = await call(`/api/events/${eventId}/guest-invites`, "POST", {
        emails,
        note: note.trim() || null,
      });
      const results = payload.outcomes as Outcome[];
      setOutcomes(results);
      // Keep only the addresses that didn't go out, so a retry doesn't re-send the rest.
      setEmailsText(results.filter((r) => r.status !== "sent").map((r) => r.email).join("\n"));
      await load();
    });
  }

  function resend(guest: GuestRow) {
    void run(async () => {
      await call(`/api/events/${eventId}/guest-invites/${guest.id}`, "POST");
      await load();
    });
  }

  function revoke(guest: GuestRow) {
    if (!window.confirm(`Remove ${guest.email}? Their link stops working right away.`)) return;
    void run(async () => {
      await call(`/api/events/${eventId}/guest-invites/${guest.id}`, "DELETE");
      await load();
    });
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-2 border-t pt-6">
        <h2 className="text-sm font-semibold">Guest invitations</h2>
        <p className="text-sm text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!state) return null;

  return (
    <div className="flex flex-col gap-4 border-t pt-6">
      <div>
        <h2 className="text-sm font-semibold">Guest invitations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring in someone who isn&apos;t a member without sending them through public registration — share a private
          link, or email them an invitation.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!state.token ? (
        <div>
          <Button size="sm" variant="outline" disabled={pending} onClick={enable}>
            <Link2 className="mr-1.5 h-4 w-4" />
            Allow guests with a private link
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Private guest link</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1.5 text-xs">{guestUrl}</code>
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can share this same link with as many people as you&apos;d like to invite. Each person enters their
              own name and email to join. Only share it with people you trust, since anyone who has the link can join.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={regenerate}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Regenerate link
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={disable}>
                Turn off
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong className="font-medium">Regenerate link</strong> creates a brand-new link. The previous link will
              no longer work for anyone it was shared with, and anyone who already joined through it is removed. Guests
              you invited by email keep their access. You don&apos;t need this to share the link with more people — use
              it only if the link has been shared more widely than you intended.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="guest-invite-emails" className="text-sm font-medium">
              Invite by email
            </label>
            <Textarea
              id="guest-invite-emails"
              rows={2}
              placeholder="name@example.com, another@example.com"
              value={emailsText}
              onChange={(event) => setEmailsText(event.target.value)}
            />
            <Textarea
              rows={2}
              maxLength={1000}
              placeholder="Optional personal note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p>
                Separate addresses with commas, spaces or new lines. Each guest gets their own personal join link and a
                calendar invite, and the note (if you add one) goes to everyone in this send. You&apos;ll be BCC&apos;d
                on every invitation, and their replies come to you.
              </p>
              <p>
                Limits: up to {MAX_INVITES_PER_REQUEST} addresses at a time, {MAX_INVITES_PER_EVENT} invitations per
                event, and {MAX_INVITES_PER_HOST_PER_DAY} per day. To re-send an invitation, use Resend next to that
                guest below; it counts toward the daily limit.
              </p>
            </div>
            <div>
              <Button size="sm" disabled={pending} onClick={sendInvites}>
                <Mail className="mr-1.5 h-4 w-4" />
                {pending ? "Sending…" : "Send invitations"}
              </Button>
            </div>
            {outcomes && (
              <ul className="flex flex-col gap-0.5 text-xs">
                {outcomes.map((outcome) => (
                  <li key={outcome.email} className={outcome.status === "sent" ? "text-muted-foreground" : "text-destructive"}>
                    {outcome.email} — {outcome.status === "sent" ? "invitation sent" : outcome.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state.guests.length > 0 && (
            <ul className="flex flex-col divide-y text-sm">
              {state.guests.map((guest) => (
                <li key={guest.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{guest.name ? `${guest.name} (${guest.email})` : guest.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {guest.source === "invited" && guest.invitedAt
                        ? `Invited ${formatTimestamp(guest.invitedAt)}`
                        : "Joined with the private link"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {guest.revoked ? (
                      <Badge variant="danger">Removed</Badge>
                    ) : guest.joined ? (
                      <Badge variant="success">Joined</Badge>
                    ) : (
                      <Badge variant="neutral">Not joined yet</Badge>
                    )}
                    {!guest.revoked && guest.source === "invited" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => resend(guest)}>
                        Resend
                      </Button>
                    )}
                    {!guest.revoked && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => revoke(guest)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
