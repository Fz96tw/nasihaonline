"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlagContentDialog } from "@/components/flag-content-dialog";
import { MentionTextarea } from "@/components/mention-textarea";
import type { ReviewCommentNode } from "@/lib/review";
import { getCsrfToken } from "@/lib/csrf-client";
import { renderTextWithMentions, type MentionCandidate } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/format-date";

function ReplyForm({
  itemId,
  parentId,
  allowedMemberIds,
  autoFocus,
  onPosted,
  onCancel,
}: {
  itemId: string;
  parentId: string | null;
  allowedMemberIds: string[];
  autoFocus?: boolean;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ body: body.trim(), parentId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setBody("");
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
        placeholder={parentId ? "Write a reply… (@ to tag a reviewer)" : "Share your feedback… (@ to tag a reviewer)"}
        value={body}
        onChange={setBody}
        allowedMemberIds={allowedMemberIds}
        autoFocus={autoFocus}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" disabled={submitting || !body.trim()} onClick={handleSubmit}>
          {submitting ? "Posting…" : parentId ? "Reply" : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentNode({
  comment,
  itemId,
  mentionableMembers,
  allowedMemberIds,
  currentUserId,
  isPrivileged,
  onPosted,
}: {
  comment: ReviewCommentNode;
  itemId: string;
  mentionableMembers: MentionCandidate[];
  allowedMemberIds: string[];
  currentUserId: string;
  isPrivileged: boolean;
  onPosted: () => void;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(comment.flagged);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const authorName = comment.authorName ?? "NASIHA Member";
  const canEdit = !comment.removed && (comment.authorId === currentUserId || isPrivileged);

  async function handleSaveEdit() {
    if (!editBody.trim()) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/comments/${comment.id}`, {
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

  async function handleFlag(reason: string) {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/comments/${comment.id}/flag`, {
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
    <div id={`comment-${comment.id}`} className="flex flex-col gap-3">
      <div className="rounded-[10px] border bg-muted/40 p-3">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Link href={`/members/${comment.authorId}`} aria-label={`View ${authorName}'s profile`} className="flex items-center gap-1.5">
              <Avatar name={authorName} size="xs" />
              <span className="font-medium text-foreground hover:underline">{authorName}</span>
            </Link>
            {comment.removed && <Badge variant="neutral">Removed</Badge>}
            {!comment.removed && flagged && <Badge variant="danger">Flagged</Badge>}
          </span>
          <span>
            {formatTimestamp(comment.createdAt)}
            {comment.editedAt && !comment.removed && <span className="ml-1">· edited</span>}
          </span>
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea rows={3} value={editBody} onChange={setEditBody} allowedMemberIds={allowedMemberIds} autoFocus />
            {editError && <p className="text-xs text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={editSubmitting || !editBody.trim()} onClick={handleSaveEdit}>
                {editSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p className={cn("whitespace-pre-wrap break-words text-sm", comment.removed && "italic text-muted-foreground")}>
            {renderTextWithMentions(comment.body, mentionableMembers)}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setReplying((v) => !v)}>
            {replying ? "Cancel" : "Reply"}
          </button>
          {canEdit && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setEditBody(comment.body);
                setEditError(null);
                setEditing((v) => !v);
              }}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
          {!comment.removed && !flagged && (
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
        {flagError && <p className="mt-1 text-xs text-destructive">{flagError}</p>}
        <FlagContentDialog
          open={flagDialogOpen}
          onOpenChange={setFlagDialogOpen}
          itemLabel="comment"
          submitting={flagging}
          error={flagError}
          onConfirm={handleFlag}
        />
      </div>

      {replying && (
        <div className="ml-6">
          <ReplyForm
            itemId={itemId}
            parentId={comment.id}
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

      {comment.replies.length > 0 && (
        <div className="ml-6 flex flex-col gap-3 border-l pl-4">
          {comment.replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              itemId={itemId}
              mentionableMembers={mentionableMembers}
              allowedMemberIds={allowedMemberIds}
              currentUserId={currentUserId}
              isPrivileged={isPrivileged}
              onPosted={onPosted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ReviewItem detail page's comment thread — forked from ForumThreadView.
 * One deliberate difference: `allowedMemberIds` is always passed (the
 * item's submitter + every invitee) rather than being optional, since a
 * ReviewItem's audience is always a closed set — there's no "unrestricted"
 * mode the way a community forum thread has.
 */
export function ReviewCommentThread({
  itemId,
  comments,
  mentionableMembers,
  allowedMemberIds,
  currentUserId,
  isPrivileged,
}: {
  itemId: string;
  comments: ReviewCommentNode[];
  mentionableMembers: MentionCandidate[];
  allowedMemberIds: string[];
  currentUserId: string;
  isPrivileged: boolean;
}) {
  const router = useRouter();

  return (
    <section className="flex flex-col gap-4">
      {comments.map((comment) => (
        <CommentNode
          key={comment.id}
          comment={comment}
          itemId={itemId}
          mentionableMembers={mentionableMembers}
          allowedMemberIds={allowedMemberIds}
          currentUserId={currentUserId}
          isPrivileged={isPrivileged}
          onPosted={() => router.refresh()}
        />
      ))}

      <div className="mt-4 border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold">Leave Feedback</h2>
        <ReplyForm itemId={itemId} parentId={null} allowedMemberIds={allowedMemberIds} onPosted={() => router.refresh()} />
      </div>
    </section>
  );
}
