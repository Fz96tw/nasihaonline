"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { DirectoryMember } from "@/lib/members";

const SUGGESTION_LIMIT = 8;

/**
 * Multi-select invitee picker for a restricted Event (Audience-Restricted
 * Group Events, Objective 01) — built on the same `/api/members` search +
 * directory-eligibility backend as MentionTextarea's `@` autocomplete
 * (components/mention-textarea.tsx), the reuse this objective requires. A
 * dedicated chip picker rather than a literal `@Name`-in-text field: a
 * restricted event's invited list is a fixed set of members, not free text,
 * so ids (not parsed names) are the source of truth passed to onChange.
 */
export function InviteePicker({
  value,
  onChange,
  excludeUserId,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** The organizer's own id — excluded from suggestions since they're already implicitly part of the event as its host. */
  excludeUserId?: string;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DirectoryMember[]>([]);
  const [selected, setSelected] = useState<DirectoryMember[]>([]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const members: DirectoryMember[] = Array.isArray(payload?.members) ? payload.members : [];
        setSuggestions(
          members
            .filter((member) => member.name && member.id !== excludeUserId && !value.includes(member.id))
            .slice(0, SUGGESTION_LIMIT),
        );
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, value, excludeUserId]);

  function addMember(member: DirectoryMember) {
    if (value.includes(member.id)) return;
    setSelected((current) => [...current, member]);
    onChange([...value, member.id]);
    setQuery("");
    setSuggestions([]);
  }

  function removeMember(id: string) {
    setSelected((current) => current.filter((member) => member.id !== id));
    onChange(value.filter((memberId) => memberId !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Input
          placeholder="Search members by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((member) => (
            <Badge key={member.id} variant="info" className="flex items-center gap-1.5 py-1 pl-1 pr-2">
              <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" className="h-4 w-4" />
              {member.name}
              <button
                type="button"
                onClick={() => removeMember(member.id)}
                aria-label={`Remove ${member.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
