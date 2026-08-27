"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { FlagContentDialog } from "@/components/flag-content-dialog";
import { MentionTextarea } from "@/components/mention-textarea";
import type { ForumPostNode } from "@/lib/forums";
import { getCsrfToken } from "@/lib/csrf-client";
import { renderTextWithMentions, type MentionCandidate } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/format-date";

function ReplyForm({
  threadId,
  parentId,
  requireDeidentification,
  allowedMemberIds,
  autoFocus,
  onPosted,
  onCancel,
}: {
  threadId: string;
  parentId: string | null;
  requireDeidentification: boolean;
  /** Member-Initiated Restricted Forum Threads (§4.13/§11.16) — narrows the `@`-mention autocomplete to the thread's author + invitees; omit for an unrestricted (community) thread. */
  allowedMemberIds?: string[];
  autoFocus?: boolean;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  async function handleSubmit() {
    if (!body.trim()) return;
    if (requireDeidentification && !confirmed) {
      setError("You must confirm all patient information has been de-identified.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ body: body.trim(), parentId, deidentificationConfirmed: confirmed }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setBody("");
      setConfirmed(false);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <MentionTextarea
        rows={parentId ? 2 : 3}
        placeholder={parentId ? "Write a reply… (@ to tag a member)" : "Write a post… (@ to tag a member)"}
        value={body}
        onChange={setBody}
        allowedMemberIds={allowedMemberIds}
        autoFocus={autoFocus}
        pasteImageUploadUrl="/api/forums/post-image"
        onImageUploadStateChange={setImageUploading}
      />
      {requireDeidentification && (
        <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} />
          <span>I confirm all patient information has been de-identified</span>
        </label>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" disabled={submitting || imageUploading || !body.trim()} onClick={handleSubmit}>
          {submitting ? "Posting…" : parentId ? "Reply" : "Post"}
        </Button>
      </div>
    </div>
  );
}

function PostNode({
  post,
  threadId,
  requireDeidentification,
  mentionableMembers,
  allowedMemberIds,
  currentUserId,
  isPrivileged,
  onPosted,
  highlightQuery,
}: {
  post: ForumPostNode;
  threadId: string;
  requireDeidentification: boolean;
  mentionableMembers: MentionCandidate[];
  allowedMemberIds?: string[];
  currentUserId: string;
  isPrivileged: boolean;
  onPosted: () => void;
  /** Active search query when arriving from a search result (see lib/feed.ts's withFeedRef) — highlights every match in this post's body. */
  highlightQuery?: string;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(post.flagged);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editImageUploading, setEditImageUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const authorName = post.authorName ?? "NASIHA Member";
  const canEdit = !post.removed && (post.authorId === currentUserId || isPrivileged);

  async function handleSaveEdit() {
    if (!editBody.trim()) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/posts/${post.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setEditing(false);
      onPosted();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/posts/${post.id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      onPosted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleFlag(reason: string) {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/posts/${post.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setFlagged(true);
      setFlagDialogOpen(false);
      router.refresh();
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFlagging(false);
    }
  }

  return (
    <div id={`post-${post.id}`} className="flex flex-col gap-3">
      <div className="rounded-[10px] border bg-muted/40 p-3">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            {post.authorProfile ? (
              <Link
                href={`/members/${post.authorProfile.id}`}
                aria-label={`View ${authorName}'s profile`}
                className="flex items-center gap-1.5"
              >
                <Avatar name={authorName} src={post.authorProfile.avatarUrl} size="xs" />
                <span className="font-medium text-foreground hover:underline">{authorName}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-1.5">
                <Avatar name={authorName} size="xs" />
                <span className="font-medium text-foreground">{authorName}</span>
              </span>
            )}
            {post.removed && <Badge variant="neutral">Removed</Badge>}
            {!post.removed && flagged && <Badge variant="danger">Flagged</Badge>}
          </span>
          <span>
            {formatTimestamp(post.createdAt)}
            {post.editedAt && !post.removed && <span className="ml-1">· edited</span>}
          </span>
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea
              rows={3}
              value={editBody}
              onChange={setEditBody}
              allowedMemberIds={allowedMemberIds}
              autoFocus
              pasteImageUploadUrl="/api/forums/post-image"
              onImageUploadStateChange={setEditImageUploading}
            />
            {editError && <p className="text-xs text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={editSubmitting || editImageUploading || !editBody.trim()}
                onClick={handleSaveEdit}
              >
                {editSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p className={cn("whitespace-pre-wrap break-words text-sm", post.removed && "italic text-muted-foreground")}>
            {renderTextWithMentions(post.body, mentionableMembers, highlightQuery)}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setReplying((value) => !value)}
          >
            {replying ? "Cancel" : "Reply"}
          </button>
          {canEdit && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setEditBody(post.body);
                setEditError(null);
                setEditing((value) => !value);
              }}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          {!post.removed && !flagged && (
            <button
              type="button"
              title="Flag for moderator review"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
              onClick={() => setFlagDialogOpen(true)}
            >
              <Flag className="h-3 w-3" />
              Flag
            </button>
          )}
        </div>
        {deleteError && <p className="mt-1 text-xs text-destructive">{deleteError}</p>}
        {flagError && <p className="mt-1 text-xs text-destructive">{flagError}</p>}
        <FlagContentDialog
          open={flagDialogOpen}
          onOpenChange={setFlagDialogOpen}
          itemLabel="reply"
          submitting={flagging}
          error={flagError}
          onConfirm={handleFlag}
        />
      </div>

      {replying && (
        <div className="ml-6">
          <ReplyForm
            threadId={threadId}
            parentId={post.id}
            requireDeidentification={requireDeidentification}
            allowedMemberIds={allowedMemberIds}
            autoFocus
            onCancel={() => setReplying(false)}
            onPosted={() => {
              setReplying(false);
              onPosted();
            }}
          />
        </div>
      )}

      {post.replies.length > 0 && (
        <div className="ml-6 flex flex-col gap-3 border-l pl-4">
          {post.replies.map((reply) => (
            <PostNode
              key={reply.id}
              post={reply}
              threadId={threadId}
              requireDeidentification={requireDeidentification}
              mentionableMembers={mentionableMembers}
              allowedMemberIds={allowedMemberIds}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              onPosted={onPosted}
              highlightQuery={highlightQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Thread detail — opening post + threaded replies (§4.13), rendered below the thread header. */
export function ForumThreadView({
  threadId,
  posts,
  requireDeidentification,
  mentionableMembers,
  allowedMemberIds,
  currentUserId,
  isPrivileged,
  highlightQuery,
}: {
  threadId: string;
  posts: ForumPostNode[];
  requireDeidentification: boolean;
  mentionableMembers: MentionCandidate[];
  /** Member-Initiated Restricted Forum Threads (§4.13/§11.16) — narrows every reply composer's `@`-mention autocomplete to the thread's author + invitees; omit for an unrestricted (community) thread. */
  allowedMemberIds?: string[];
  currentUserId: string;
  isPrivileged: boolean;
  /** Active search query when arriving from a search result (see lib/feed.ts's withFeedRef) — highlights every match across every post's body. */
  highlightQuery?: string;
}) {
  const router = useRouter();

  return (
    <section className="flex flex-col gap-4">
      {posts.map((post) => (
        <PostNode
          key={post.id}
          post={post}
          threadId={threadId}
          requireDeidentification={requireDeidentification}
          mentionableMembers={mentionableMembers}
          allowedMemberIds={allowedMemberIds}
          currentUserId={currentUserId}
          isPrivileged={isPrivileged}
          onPosted={() => router.refresh()}
          highlightQuery={highlightQuery}
        />
      ))}

      <div className="mt-4 border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold">Post a Reply</h2>
        <ReplyForm
          threadId={threadId}
          parentId={null}
          requireDeidentification={requireDeidentification}
          allowedMemberIds={allowedMemberIds}
          onPosted={() => router.refresh()}
        />
      </div>
    </section>
  );
}
