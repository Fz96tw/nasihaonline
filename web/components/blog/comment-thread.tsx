"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MentionTextarea } from "@/components/mention-textarea";
import type { PostCommentNode } from "@/lib/blog";
import { getCsrfToken } from "@/lib/csrf-client";
import { formatTimestamp } from "@/lib/format-date";
import { renderTextWithMentions, type MentionCandidate } from "@/lib/mentions";

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
  const [replying, setReplying] = useState(false);

  return (
    <div id={`comment-${comment.id}`} className="flex flex-col gap-3">
      <div className="rounded-[10px] border bg-muted/40 p-3">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.authorName ?? "NASIHA Member"}</span>
          <span>{formatTimestamp(comment.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{renderTextWithMentions(comment.body, mentionableMembers)}</p>
        {canComment && (
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary hover:underline"
            onClick={() => setReplying((value) => !value)}
          >
            {replying ? "Cancel" : "Reply"}
          </button>
        )}
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
