"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { DirectoryMember } from "@/lib/members";
import { usePasteImageUpload } from "@/lib/use-paste-image-upload";
import { QuickRecordingPicker, type QuickRecordingListItem } from "@/components/quick-recording-picker";

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
  allowedMemberIds,
  pasteImageUploadUrl,
  onImageUploadStateChange,
  videoPickerEnabled,
  ...textareaProps
}: Omit<TextareaProps, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Member-Initiated Restricted Forum Threads (§4.13/§11.16) — when set, narrows suggestions to this id set so a restricted thread's composer can't autocomplete-suggest (and thus can't silently notify) a non-invitee. Omit for the unrestricted default. */
  allowedMemberIds?: string[];
  /** When set, pasting a clipboard image uploads it to this endpoint and inserts a `![](url)` token at the caret (§4.13 paste-to-upload). Omit to leave paste behavior untouched (e.g. Peer Review's comment thread, which doesn't support this yet). */
  pasteImageUploadUrl?: string;
  /** Notified whenever the paste-image upload's in-flight state changes, so the parent form can disable its submit button meanwhile. */
  onImageUploadStateChange?: (uploading: boolean) => void;
  /** When true, shows an "Insert a video…" toolbar action (QuickRecordingPicker) above the textarea, wired to this component's own internal insertAtCaret — not exposed externally, so this has to be an opt-in prop rather than a caller-driven imperative call. Omit to leave the composer as a plain mention textarea (e.g. a post-body edit, which doesn't support this yet). */
  videoPickerEnabled?: boolean;
}) {
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [suggestions, setSuggestions] = useState<DirectoryMember[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCaret = useCallback(
    (markdown: string) => {
      const caret = textareaRef.current?.selectionStart ?? value.length;
      onChange(`${value.slice(0, caret)}${markdown}${value.slice(caret)}`);
    },
    [value, onChange],
  );

  const pasteImage = usePasteImageUpload({
    uploadUrl: pasteImageUploadUrl ?? "",
    value,
    onInserted: insertAtCaret,
  });

  useEffect(() => {
    onImageUploadStateChange?.(pasteImage.uploading);
  }, [pasteImage.uploading, onImageUploadStateChange]);

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
        setSuggestions(
          members
            .filter((member) => member.name && (!allowedMemberIds || allowedMemberIds.includes(member.id)))
            .slice(0, SUGGESTION_LIMIT),
        );
        setActiveIndex(0);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, allowedMemberIds]);

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

  function insertVideo(recording: QuickRecordingListItem) {
    insertAtCaret(`![${recording.topic}](/api/inbox/meeting-requests/${recording.meetingRequestId}/recording/${recording.id})`);
  }

  return (
    <div className="relative">
      {videoPickerEnabled && (
        <div className="mb-2">
          <QuickRecordingPicker onSelect={insertVideo} triggerLabel="Insert a video…" />
        </div>
      )}
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        onPaste={pasteImageUploadUrl ? pasteImage.onPaste : textareaProps.onPaste}
      />
      {pasteImageUploadUrl && pasteImage.uploading && (
        <p className="mt-1 text-xs text-muted-foreground">Uploading image…</p>
      )}
      {pasteImageUploadUrl && pasteImage.error && <p className="mt-1 text-xs text-destructive">{pasteImage.error}</p>}
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
