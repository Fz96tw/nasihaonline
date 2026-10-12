"use client";

import { useCallback, useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

const POLL_INTERVAL_MS = 5000;

type PendingGuest = { id: string; name: string | null; email: string; requestedAt: string };

/**
 * Host/co-host card listing a private event's shareable-link guests who are
 * waiting to be let in, with Admit / Deny for each. Floats above both the
 * waiting room and the live LiveKit screen (which is itself fixed at
 * z-[60]), and renders nothing while nobody is waiting. Polls rather than
 * pushing, same as the waiting room's own status poll.
 */
export function PendingGuestApprovals({ endpoint }: { endpoint: string }) {
  const [guests, setGuests] = useState<PendingGuest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const payload = (await res.json()) as { guests: PendingGuest[] };
      setGuests(payload.guests);
    } catch {
      // Transient poll failure — the next tick retries.
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function decide(guest: PendingGuest, admit: boolean) {
    if (!admit && !window.confirm(`Turn away ${guest.name ?? guest.email}? They'll be emailed that they can't join.`)) {
      return;
    }
    setBusyId(guest.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`${endpoint}/${guest.id}`, {
        method: admit ? "POST" : "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      setGuests((current) => current.filter((row) => row.id !== guest.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  if (guests.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Guests waiting to join"
      className="fixed bottom-24 right-4 z-[70] flex w-80 flex-col gap-2 rounded-lg border bg-background p-3 text-left shadow-lg"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <UserCheck className="h-4 w-4" />
        {guests.length === 1 ? "1 guest is waiting to join" : `${guests.length} guests are waiting to join`}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {guests.map((guest) => (
          <li key={guest.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{guest.name ?? guest.email}</p>
              {guest.name && <p className="truncate text-xs text-muted-foreground">{guest.email}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" disabled={busyId === guest.id} onClick={() => void decide(guest, true)}>
                Admit
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === guest.id} onClick={() => void decide(guest, false)}>
                Deny
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
