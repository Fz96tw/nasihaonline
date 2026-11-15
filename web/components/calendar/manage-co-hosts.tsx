"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/csrf-client";
import type { EventCoHostMember } from "@/lib/events";
import type { DirectoryMember } from "@/lib/members";

/**
 * Co-host editor on a Nasiha Conference event's detail page, for any
 * visibility (public and restricted alike) and at any time before or during
 * the meeting. Shown to the host, admins and existing co-hosts, the same
 * people allowed to change co-hosts in the meeting itself. Each add/remove
 * is saved immediately, same pattern as ManageInvitees.
 */
export function ManageCoHosts({
  eventId,
  hostId,
  isRestricted,
  initialCoHosts,
}: {
  eventId: string;
  hostId: string;
  /** Restricted event: adding a co-host also invites them (see updateEventCoHosts). */
  isRestricted: boolean;
  initialCoHosts: EventCoHostMember[];
}) {
  const [coHosts, setCoHosts] = useState(initialCoHosts);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DirectoryMember[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/members?q=${encodeURIComponent(value.trim())}`);
      if (!res.ok) return;
      const payload = await res.json();
      const members: DirectoryMember[] = Array.isArray(payload?.members) ? payload.members : [];
      setSuggestions(
        members
          .filter((member) => member.name && member.id !== hostId && !coHosts.some((c) => c.userId === member.id))
          .slice(0, 8),
      );
    } catch {
      setSuggestions([]);
    }
  }

  async function patchCoHosts(body: { addUserIds?: string[]; removeUserIds?: string[] }): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/co-hosts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function addMember(member: DirectoryMember) {
    setQuery("");
    setSuggestions([]);
    const ok = await patchCoHosts({ addUserIds: [member.id] });
    if (ok) {
      setCoHosts((current) => [...current, { userId: member.id, name: member.name, avatarUrl: member.avatarUrl }]);
    }
  }

  async function removeMember(userId: string, name: string | null) {
    if (!window.confirm(`Remove ${name ?? "this member"} as a co-host?`)) return;
    const ok = await patchCoHosts({ removeUserIds: [userId] });
    if (ok) setCoHosts((current) => current.filter((member) => member.userId !== userId));
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 className="text-sm font-semibold">Co-hosts ({coHosts.length})</h2>
        <p className="text-xs text-muted-foreground">
          Co-hosts can start and stop recording, manage participants and name further co-hosts in the Nasiha
          Conference meeting, and can join without an RSVP.
          {isRestricted && " Adding a co-host also invites them to this event."}
        </p>
      </div>

      {coHosts.length > 0 && (
        <ul className="flex flex-col divide-y">
          {coHosts.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2">
                <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
                <span className="text-sm">{member.name ?? "A member"}</span>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeMember(member.userId, member.name)}
                aria-label={`Remove ${member.name ?? "member"} as co-host`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative max-w-xs">
        <Input
          placeholder="Add a co-host…"
          aria-label="Add a co-host"
          value={query}
          onChange={(e) => search(e.target.value)}
          disabled={pending}
        />
        {suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {suggestions.map((member) => (
              <button
                key={member.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addMember(member)}
              >
                <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
                <span>{member.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
