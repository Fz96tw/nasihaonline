"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/csrf-client";
import type { ReviewItemRosterMember } from "@/lib/review";
import type { DirectoryMember } from "@/lib/members";

/**
 * Submitter-facing invited-reviewer list editor on a ReviewItem's detail
 * page — add and remove reviewers after submission, each action posted
 * immediately. Forked from ManageLibraryInvitees, plus a per-reviewer
 * "has commented" checkmark (ReviewItemRosterMember.hasCommented) giving
 * the submitter live visibility into who has responded, which the Library
 * has no equivalent of.
 */
export function ManageReviewInvitees({ itemId, initialRoster }: { itemId: string; initialRoster: ReviewItemRosterMember[] }) {
  const [roster, setRoster] = useState(initialRoster);
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
      setSuggestions(members.filter((member) => member.name && !roster.some((r) => r.userId === member.id)).slice(0, 8));
    } catch {
      setSuggestions([]);
    }
  }

  async function patchInvitees(body: { addUserIds?: string[]; removeUserIds?: string[] }): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/invitees`, {
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
    const ok = await patchInvitees({ addUserIds: [member.id] });
    if (ok) {
      setRoster((current) => [
        ...current,
        { userId: member.id, name: member.name, avatarUrl: member.avatarUrl, hasCommented: false },
      ]);
    }
  }

  async function removeMember(userId: string, name: string | null) {
    if (!window.confirm(`Remove ${name ?? "this reviewer"} from the invited list? They'll be notified.`)) return;
    const ok = await patchInvitees({ removeUserIds: [userId] });
    if (ok) setRoster((current) => current.filter((member) => member.userId !== userId));
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <h2 className="text-sm font-semibold">Reviewers ({roster.length})</h2>

      {roster.length > 0 && (
        <ul className="flex flex-col divide-y">
          {roster.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2">
                <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
                <span className="text-sm">{member.name ?? "A member"}</span>
                {member.hasCommented && (
                  <span className="flex items-center gap-0.5 text-xs text-success" title="Has left feedback">
                    <Check className="h-3 w-3" />
                    reviewed
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeMember(member.userId, member.name)}
                aria-label={`Remove ${member.name ?? "member"}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative max-w-xs">
        <Input placeholder="Add a reviewer…" value={query} onChange={(e) => search(e.target.value)} disabled={pending} />
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
