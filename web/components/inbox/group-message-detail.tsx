"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogOut, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GroupAvatars } from "@/components/inbox/inbox-list";
import {
  formatGroupParticipantNames,
  MAX_GROUP_MESSAGE_PARTICIPANTS,
  type GroupMessageThread,
  type GroupMessageThreadMessage,
} from "@/lib/inbox";
import { type DirectoryMember } from "@/lib/members";
import { getCsrfToken } from "@/lib/csrf-client";
import { linkifyText } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { usePasteImageUpload } from "@/lib/use-paste-image-upload";

// Group messages are forum posts underneath (§4.7), so pasted images and
// edits go through the forum endpoints.
const PASTE_UPLOAD_URL = "/api/forums/post-image";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function readError(res: Response): Promise<string> {
  const payload = await res.json().catch(() => null);
  return typeof payload?.error === "string" ? payload.error : "Something went wrong.";
}

async function fetchMembers(): Promise<DirectoryMember[]> {
  const response = await fetch("/api/members");
  if (!response.ok) throw new Error("Failed to load members");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

function GroupMessageBubble({
  message,
  onEdited,
}: {
  message: GroupMessageThreadMessage;
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

  const pasteImage = usePasteImageUpload({ uploadUrl: PASTE_UPLOAD_URL, value: editBody, onInserted: insertAtCaret });

  async function handleSaveEdit() {
    if (!editBody.trim()) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/posts/${message.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setEditing(false);
      await onEdited();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div className={cn("flex max-w-[85%] gap-2", message.isOwn && "ml-auto flex-row-reverse")}>
      {!message.isOwn && (
        <Avatar name={message.senderName} src={message.senderAvatarUrl} size="xs" className="mt-1 flex-shrink-0" />
      )}
      <div className={cn("min-w-0 flex-1 rounded-[10px] border p-3", message.isOwn ? "bg-primary/10" : "bg-muted/40")}>
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="font-medium">{message.isOwn ? "You" : message.senderName}</span>
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
            <p className={cn("whitespace-pre-wrap break-words text-sm", message.removed && "italic text-muted-foreground")}>
              {message.removed ? message.body : linkifyText(message.body)}
            </p>
            {message.isOwn && !message.removed && (
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
    </div>
  );
}

/**
 * The participants popover in a group's header (§4.7): everyone in the
 * group, with add/remove for the author (or an admin) and Leave for an
 * invitee. Add/remove reuse the restricted-thread invitee route (§4.13).
 */
function ParticipantsControl({
  thread,
  currentUserId,
  onChanged,
  onLeft,
}: {
  thread: GroupMessageThread;
  currentUserId: string;
  onChanged: () => Promise<unknown>;
  onLeft: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["members-for-new-conversation"],
    queryFn: fetchMembers,
    enabled: thread.canAddParticipants && open,
  });
  const participantIds = useMemo(() => new Set(thread.participants.map((p) => p.id)), [thread.participants]);
  const addable = members.filter((member) => !participantIds.has(member.id));
  const atCap = thread.participants.length >= MAX_GROUP_MESSAGE_PARTICIPANTS;

  async function patchInvitees(body: { addUserIds: string[]; removeUserIds: string[] }) {
    setBusy(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/threads/${thread.id}/invitees`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      setAdding(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm(`Leave "${thread.subject}"? It will disappear from your Inbox.`)) return;
    setBusy(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/inbox/groups/${thread.id}/leave`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error(await readError(res));
      setOpen(false);
      await onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAdding(false);
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="flex-shrink-0 gap-1.5">
          <Users className="h-4 w-4" />
          {thread.participants.length}
          <span className="sr-only">people in this group</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        {adding ? (
          <Command>
            <CommandInput placeholder="Add a member…" />
            <CommandList>
              <CommandEmpty>No member found.</CommandEmpty>
              <CommandGroup>
                {addable.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.name ?? member.id}
                    disabled={busy}
                    onSelect={() => patchInvitees({ addUserIds: [member.id], removeUserIds: [] })}
                  >
                    {member.name ?? "Unnamed member"}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="flex flex-col">
            <p className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
              {thread.participants.length} people
            </p>
            <ul className="max-h-64 overflow-y-auto py-1">
              {thread.participants.map((participant) => {
                const isAuthor = participant.id === thread.authorId;
                const removable =
                  thread.canRemoveParticipants && !isAuthor && thread.participants.length > 2;
                return (
                  <li key={participant.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <Avatar name={participant.name} src={participant.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {participant.id === currentUserId ? "You" : participant.name}
                      {isAuthor && <span className="ml-1 text-xs text-muted-foreground">· started it</span>}
                    </span>
                    {removable && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${participant.name} from this group?`)) {
                            patchInvitees({ addUserIds: [], removeUserIds: [participant.id] });
                          }
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${participant.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-1 border-t p-2">
              {thread.canAddParticipants && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start gap-2"
                  disabled={busy || atCap}
                  onClick={() => setAdding(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  {atCap ? `Full (${MAX_GROUP_MESSAGE_PARTICIPANTS} people)` : "Add people"}
                </Button>
              )}
              {thread.canLeave && (
                <Button variant="ghost" size="sm" className="justify-start gap-2" disabled={busy} onClick={leave}>
                  <LogOut className="h-4 w-4" />
                  Leave group
                </Button>
              )}
            </div>
          </div>
        )}
        {error && <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}

/** Inbox detail pane for a group message (§4.7) — same layout as a direct message's InboxDetail. */
export function GroupMessageDetail({
  thread,
  isLoading,
  currentUserId,
  onBack,
  onThreadChanged,
  onLeft,
}: {
  thread: GroupMessageThread | undefined;
  isLoading: boolean;
  currentUserId: string;
  onBack: () => void;
  onThreadChanged: () => Promise<unknown>;
  onLeft: () => Promise<unknown>;
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

  const pasteImage = usePasteImageUpload({ uploadUrl: PASTE_UPLOAD_URL, value: body, onInserted: insertAtCaret });

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
      const res = await fetch(`/api/forums/threads/${thread.id}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ body: body.trim(), parentId: null, deidentificationConfirmed: false }),
      });
      if (!res.ok) throw new Error(await readError(res));
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
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={onBack} aria-label="Back to messages">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <GroupAvatars participants={thread.participants} currentUserId={currentUserId} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{thread.subject}</div>
          <div className="truncate text-xs text-muted-foreground">
            Group with {formatGroupParticipantNames(thread.participants, currentUserId, 4)}
          </div>
        </div>
        <ParticipantsControl
          thread={thread}
          currentUserId={currentUserId}
          onChanged={onThreadChanged}
          onLeft={onLeft}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {thread.messages.map((message) => (
          <GroupMessageBubble key={message.id} message={message} onEdited={onThreadChanged} />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t p-4">
        <Textarea
          rows={3}
          placeholder="Write to the group…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onPaste={pasteImage.onPaste}
          ref={textareaRef}
          aria-label="Write to the group"
        />
        {pasteImage.uploading && <p className="text-xs text-muted-foreground">Uploading image…</p>}
        {pasteImage.error && <p className="text-sm text-destructive">{pasteImage.error}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="self-end" disabled={submitting || pasteImage.uploading || !body.trim()} onClick={handleReply}>
          {submitting ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
