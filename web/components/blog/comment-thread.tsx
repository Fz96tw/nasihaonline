"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlagContentDialog } from "@/components/flag-content-dialog";
import { MentionTextarea } from "@/components/mention-textarea";
import type { PostCommentNode } from "@/lib/blog";
import { getCsrfToken } from "@/lib/csrf-client";
import { formatTimestamp } from "@/lib/format-date";
import { renderTextWithMentions, type MentionCandidate } from "@/lib/mentions";
import { cn } from "@/lib/utils";

function CommentForm({
  slug,
  parentId,
  autoFocus,
  onPosted,
  onCancel,
}: {
  slug: string;
  parentId: string | null;
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
      const res = await fetch(`/api/blog/${slug}/comments`, {
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
        placeholder={parentId ? "Write a reply… (@ to tag a member)" : "Write a comment… (@ to tag a member)"}
        value={body}
        onChange={setBody}
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
          {submitting ? "Posting…" : parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </div>
  );
}

function CommentNode({
  comment,
  slug,
  canComment,
  mentionableMembers,
  onPosted,
}: {
  comment: PostCommentNode;
  slug: string;
  canComment: boolean;
  mentionableMembers: MentionCandidate[];
  onPosted: () => void;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(comment.flagged);
  const [flagError, setFlagError] = useState<string | null>(null);

  async function handleFlag(reason: string) {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/blog/comments/${comment.id}/flag`, {
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
            <span className="font-medium text-foreground">{comment.authorName ?? "NASIHA Member"}</span>
            {comment.removed && <Badge variant="neutral">Removed</Badge>}
            {!comment.removed && flagged && <Badge variant="danger">Flagged</Badge>}
          </span>
          <span>{formatTimestamp(comment.createdAt)}</span>
        </div>
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm",
            comment.removed && "italic text-muted-foreground",
          )}
        >
          {renderTextWithMentions(comment.body, mentionableMembers)}
        </p>
        {canComment && (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setReplying((value) => !value)}
            >
              {replying ? "Cancel" : "Reply"}
            </button>
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
        )}
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
          <CommentForm
            slug={slug}
            parentId={comment.id}
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
              slug={slug}
              canComment={canComment}
              mentionableMembers={mentionableMembers}
              onPosted={onPosted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Threaded comments on a published post (§4.8), rendered below the post body. */
export function CommentThread({
  slug,
  comments,
  canComment,
  mentionableMembers,
}: {
  slug: string;
  comments: PostCommentNode[];
  canComment: boolean;
  mentionableMembers: MentionCandidate[];
}) {
  const router = useRouter();

  return (
    <section className="mt-12 border-t pt-8">
      {canComment ? (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Share your thoughts</h2>
          <CommentForm slug={slug} parentId={null} onPosted={() => router.refresh()} />
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              slug={slug}
              canComment={canComment}
              mentionableMembers={mentionableMembers}
              onPosted={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </section>
  );
}
