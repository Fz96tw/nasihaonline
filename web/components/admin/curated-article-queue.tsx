"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Pencil, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format-date";
import {
  CURATED_ARTICLE_PLACEHOLDER_IMAGE,
  type CommunityOption,
  type ExternalArticleDto,
} from "@/lib/curated-articles";
import { FROM_THE_WEB_FORUM_SLUG } from "@/lib/forums";
import { CURATED_EXCERPT_MAX, CURATED_TITLE_MAX, curatedArticleUpdateSchema } from "@/lib/validation/curated-articles";
import { CommunityPicker, communityNames, curatedAdminRequest } from "@/components/admin/curated-articles-shared";

/** Scheduled-fetch switch and "Fetch now". */
export function CuratedFetchControls({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function toggle(next: boolean) {
    setOn(next);
    setBusy(true);
    setMessage(null);
    try {
      await curatedAdminRequest("PATCH", "/api/admin/curated-articles/settings", { curatedArticlesFetchEnabled: next });
      router.refresh();
    } catch (error) {
      setOn(!next);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function fetchNow() {
    setBusy(true);
    setMessage(null);
    try {
      await curatedAdminRequest("POST", "/api/admin/curated-articles/fetch", {});
      setMessage({ tone: "ok", text: "Fetch queued. New articles appear here within a few minutes; refresh to see them." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't queue a fetch." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fetching</CardTitle>
        <CardDescription>
          Every 6 hours the worker checks each enabled source and adds matching articles here as pending. Nothing reaches members until you
          approve it. Pending articles nobody reviews are cleared after 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Fetch new articles every 6 hours</p>
            <p className="text-sm text-muted-foreground">&ldquo;Fetch now&rdquo; works either way.</p>
          </div>
          <Switch checked={on} onCheckedChange={toggle} disabled={busy} aria-label="Fetch new articles every 6 hours" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={fetchNow} disabled={busy}>
            Fetch now
          </Button>
          {message && (
            <p role="status" className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Paste one article link to queue it. */
export function AddArticleByUrlForm({ communities }: { communities: CommunityOption[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [communityIds, setCommunityIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await curatedAdminRequest("POST", "/api/admin/curated-articles/articles", { url, communityIds });
      setUrl("");
      setCommunityIds([]);
      router.push("/admin/curated-articles?status=pending");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that article.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an article by link</CardTitle>
        <CardDescription>We read the page&apos;s link preview (headline, summary, image) and add it to the pending list for review.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="curated-add-url">Article link</Label>
            <Input
              id="curated-add-url"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <CommunityPicker communities={communities} value={communityIds} onChange={setCommunityIds} disabled={busy} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? "Reading the page…" : "Add to queue"}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ArticleCard({ initial, communities }: { initial: ExternalArticleDto; communities: CommunityOption[] }) {
  const router = useRouter();
  const [article, setArticle] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: initial.title, excerpt: initial.excerpt, communityIds: initial.communityIds });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<string | null>(null);

  async function setStatus(status: "pending" | "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await curatedAdminRequest("POST", `/api/admin/curated-articles/articles/${article.id}/status`, { status });
      setMovedTo(status === "approved" ? "Approved: it's now in What's New." : status === "rejected" ? "Rejected." : "Moved back to pending.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the article.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    const parsed = curatedArticleUpdateSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await curatedAdminRequest<{ article: ExternalArticleDto }>("PATCH", `/api/admin/curated-articles/articles/${article.id}`, parsed.data);
      setArticle(result.article);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (movedTo) {
    return (
      <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" role="status">
        <span className="font-medium text-foreground">{article.title}</span>: {movedTo}
      </li>
    );
  }

  const names = communityNames(communities, article.communityIds);
  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied thumbnail or static placeholder */}
        <img
          src={article.imageUrl ?? CURATED_ARTICLE_PLACEHOLDER_IMAGE}
          alt=""
          className="aspect-[8/3] w-full flex-shrink-0 rounded-md bg-muted object-cover sm:aspect-[4/3] sm:w-40"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {editing ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`title-${article.id}`}>Headline</Label>
                <Input
                  id={`title-${article.id}`}
                  value={draft.title}
                  maxLength={CURATED_TITLE_MAX}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`excerpt-${article.id}`}>Blurb shown in the feed</Label>
                <Textarea
                  id={`excerpt-${article.id}`}
                  rows={3}
                  value={draft.excerpt}
                  maxLength={CURATED_EXCERPT_MAX}
                  onChange={(e) => setDraft((prev) => ({ ...prev, excerpt: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  A short teaser in your own words or the publisher&apos;s summary. Don&apos;t paste the article itself.
                </p>
              </div>
              <CommunityPicker
                communities={communities}
                value={draft.communityIds}
                onChange={(communityIds) => setDraft((prev) => ({ ...prev, communityIds }))}
                disabled={busy}
              />
            </div>
          ) : (
            <>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-semibold leading-snug hover:underline"
              >
                {article.title}
                <ExternalLink className="ml-1 inline h-4 w-4 align-[-2px] text-muted-foreground" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <p className="text-xs text-muted-foreground">
                {article.sourceName}
                {article.feedSourceName && article.feedSourceName !== article.sourceName ? ` · via ${article.feedSourceName}` : ""}
                {article.publishedAt ? ` · published ${formatRelativeTime(article.publishedAt)}` : ""}
                {` · fetched ${formatRelativeTime(article.fetchedAt)}`}
              </p>
              {article.excerpt ? (
                <p className="text-sm text-muted-foreground">{article.excerpt}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No summary found. Add a blurb before approving.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {names.length > 0 ? (
                  names.map((name) => (
                    <Badge key={name} variant="neutral">
                      {name}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="neutral">All members</Badge>
                )}
                {article.threadId && (
                  <a href={`/forums/${FROM_THE_WEB_FORUM_SLUG}/${article.threadId}`} className="text-xs text-primary hover:underline">
                    Discussion ({article.replyCount} {article.replyCount === 1 ? "reply" : "replies"})
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
        {editing ? (
          <>
            <Button size="sm" onClick={saveEdit} disabled={busy}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft({ title: article.title, excerpt: article.excerpt, communityIds: article.communityIds });
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {article.status !== "approved" && (
              <Button size="sm" onClick={() => setStatus("approved")} disabled={busy}>
                <Check className="mr-1.5 h-4 w-4" />
                Approve
              </Button>
            )}
            {article.status !== "rejected" && (
              <Button size="sm" variant="outline" onClick={() => setStatus("rejected")} disabled={busy}>
                <X className="mr-1.5 h-4 w-4" />
                {article.status === "approved" ? "Unpublish" : "Reject"}
              </Button>
            )}
            {article.status !== "pending" && (
              <Button size="sm" variant="ghost" onClick={() => setStatus("pending")} disabled={busy}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Back to pending
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export function CuratedArticleList({
  items,
  communities,
  emptyText,
}: {
  items: ExternalArticleDto[];
  communities: CommunityOption[];
  emptyText: string;
}) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        // Keyed on status too so a refreshed list never reuses a card that already showed its "moved" note.
        <ArticleCard key={`${item.id}:${item.status}`} initial={item} communities={communities} />
      ))}
    </ul>
  );
}
