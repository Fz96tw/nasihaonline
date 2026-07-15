"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ForumPostNode } from "@/lib/forums";
import { getCsrfToken } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReplyForm({
  threadId,
  parentId,
  requireDeidentification,
  autoFocus,
  onPosted,
  onCancel,
}: {
  threadId: string;
  parentId: string | null;
  requireDeidentification: boolean;
  autoFocus?: boolean;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <Textarea
        rows={parentId ? 2 : 3}
        placeholder={parentId ? "Write a reply…" : "Write a post…"}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        autoFocus={autoFocus}
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
        <Button type="button" size="sm" disabled={submitting || !body.trim()} onClick={handleSubmit}>
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
  onPosted,
}: {
  post: ForumPostNode;
  threadId: string;
  requireDeidentification: boolean;
  onPosted: () => void;
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(post.flagged);
  const [flagError, setFlagError] = useState<string | null>(null);

  async function handleFlag() {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/posts/${post.id}/flag`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setFlagged(true);
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
            <span className="font-medium text-foreground">{post.authorName ?? "Nasiha Member"}</span>
            {post.removed && <Badge variant="neutral">Removed</Badge>}
            {!post.removed && flagged && <Badge variant="danger">Flagged</Badge>}
          </span>
          <span>{formatTimestamp(post.createdAt)}</span>
        </div>
        <p className={cn("whitespace-pre-wrap text-sm", post.removed && "italic text-muted-foreground")}>
          {post.body}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setReplying((value) => !value)}
          >
            {replying ? "Cancel" : "Reply"}
          </button>
          {!post.removed && !flagged && (
            <button
              type="button"
              disabled={flagging}
              title="Flag for moderator review"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
              onClick={handleFlag}
            >
              <Flag className="h-3 w-3" />
              {flagging ? "Flagging…" : "Flag"}
            </button>
          )}
        </div>
        {flagError && <p className="mt-1 text-xs text-destructive">{flagError}</p>}
      </div>

      {replying && (
        <div className="ml-6">
          <ReplyForm
            threadId={threadId}
            parentId={post.id}
            requireDeidentification={requireDeidentification}
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
              onPosted={onPosted}
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
}: {
  threadId: string;
  posts: ForumPostNode[];
  requireDeidentification: boolean;
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
          onPosted={() => router.refresh()}
        />
      ))}

      <div className="mt-4 border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold">Post a Reply</h2>
        <ReplyForm
          threadId={threadId}
          parentId={null}
          requireDeidentification={requireDeidentification}
          onPosted={() => router.refresh()}
        />
      </div>
    </section>
  );
}
