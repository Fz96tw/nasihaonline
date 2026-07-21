"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { DirectoryMember } from "@/lib/members";

const SUGGESTION_LIMIT = 5;

/** Finds an in-progress `@query` immediately before the caret, if any. */
function activeMentionQuery(value: string, caretIndex: number): { start: number; query: string } | null {
  const uptoCaret = value.slice(0, caretIndex);
  const match = uptoCaret.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1];
  const start = caretIndex - query.length - 1;
  return { start, query };
}

/**
 * A Textarea with `@Full Name` mention autocomplete (§4.8/§4.13) — reuses
 * the existing member-search route rather than a dedicated endpoint. Not a
 * caret-tracked popover: the suggestion list is a simple fixed dropdown
 * below the field, per the mention convention's "keep it simple" scope.
 */
export function MentionTextarea({
  value,
  onChange,
  ...textareaProps
}: Omit<TextareaProps, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<DirectoryMember[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!query || query.query.length === 0) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members?q=${encodeURIComponent(query.query)}`);
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const members: DirectoryMember[] = Array.isArray(payload?.members) ? payload.members : [];
        setSuggestions(members.filter((member) => member.name).slice(0, SUGGESTION_LIMIT));
        setActiveIndex(0);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    onChange(nextValue);
    setQuery(activeMentionQuery(nextValue, event.target.selectionStart));
  }

  function selectMember(member: DirectoryMember) {
    if (!query || !member.name) return;
    const before = value.slice(0, query.start);
    const after = value.slice(query.start + query.query.length + 1);
    const nextValue = `${before}@${member.name} ${after}`;
    onChange(nextValue);
    setQuery(null);
    setSuggestions([]);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectMember(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSuggestions([]);
    }
  }

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-full max-w-xs rounded-md border bg-popover shadow-md">
          {suggestions.map((member, index) => (
            <button
              key={member.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                index === activeIndex && "bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectMember(member)}
            >
              <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
