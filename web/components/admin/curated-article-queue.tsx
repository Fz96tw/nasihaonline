"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ExternalLink, ImageOff, Link2, Pencil, RotateCcw, Send, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format-date";
import type { ScheduledOverview } from "@/lib/curated-articles-release";
import { useHasMounted } from "@/lib/use-has-mounted";
import {
  CURATED_ARTICLE_PLACEHOLDER_IMAGE,
  type CommunityOption,
  type ExternalArticleDto,
} from "@/lib/curated-articles";
import { FROM_THE_WEB_FORUM_SLUG } from "@/lib/forums";
import {
  CURATED_EXCERPT_MAX,
  CURATED_TITLE_MAX,
  PENDING_RETENTION_OPTIONS,
  curatedArticleUpdateSchema,
} from "@/lib/validation/curated-articles";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CommunityPicker, communityNames, curatedAdminRequest } from "@/components/admin/curated-articles-shared";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Replace (upload or image link) or remove an article's image. Applies
 * immediately — including to a published article's feed row — independent of
 * the headline/blurb Save button.
 */
function ArticleImageControls({
  article,
  onChange,
  disabled,
}: {
  article: ExternalArticleDto;
  onChange: (next: ExternalArticleDto) => void;
  disabled?: boolean;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<null | "upload" | "link" | "remove">(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/admin/curated-articles/articles/${article.id}/image`;

  async function run(kind: "upload" | "link" | "remove", action: () => Promise<{ article: ExternalArticleDto }>) {
    setBusy(kind);
    setError(null);
    try {
      const result = await action();
      onChange(result.article);
      if (kind === "link") setLink("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the image.");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    await run("upload", async () => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", headers: { "x-csrf-token": await getCsrfToken() }, body });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't upload that image.");
      return payload as { article: ExternalArticleDto };
    });
  }

  const locked = disabled || busy !== null;
  return (
    <fieldset className="flex flex-col gap-2" disabled={locked}>
      <legend className="mb-1.5 text-sm font-medium">Image</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline" className={locked ? "pointer-events-none opacity-50" : "cursor-pointer"}>
          <label>
            <Upload className="mr-1.5 h-4 w-4" />
            {busy === "upload" ? "Uploading…" : "Upload image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={locked}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
        </Button>
        {article.imageUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => run("remove", () => curatedAdminRequest("DELETE", endpoint))}
          >
            <ImageOff className="mr-1.5 h-4 w-4" />
            {busy === "remove" ? "Removing…" : "Remove image"}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          inputMode="url"
          aria-label="Image link"
          placeholder="…or paste an image link (https://)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked || !link.trim()}
          onClick={() => run("link", () => curatedAdminRequest("POST", endpoint, { url: link.trim() }))}
        >
          <Link2 className="mr-1.5 h-4 w-4" />
          {busy === "link" ? "Fetching…" : "Use link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF up to 5MB, at least 200×100 pixels. Changes apply right away.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const PER_WEEK_OPTIONS = Array.from({ length: 14 }, (_, i) => i + 1);

/** Release time as the admin's local "Sat, Nov 15, 9:30 AM" (rendered after mount: viewer time zone). */
function ReleaseTime({ iso }: { iso: string }) {
  const mounted = useHasMounted();
  if (!mounted) return null;
  const date = new Date(iso);
  if (date.getTime() <= Date.now() + 60_000) return <>within the next half hour</>;
  return <>{date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>;
}

/** Scheduled-fetch switch, "Fetch now", and the per-community publishing cadence. */
export function CuratedFetchControls({ enabled, perWeek, retentionDays }: { enabled: boolean; perWeek: number; retentionDays: number }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [cadence, setCadence] = useState(perWeek);
  const [retention, setRetention] = useState(retentionDays);
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

  async function saveCadence(next: number) {
    const previous = cadence;
    setCadence(next);
    setBusy(true);
    setMessage(null);
    try {
      await curatedAdminRequest("PATCH", "/api/admin/curated-articles/settings", { curatedArticlesPerCommunityPerWeek: next });
      router.refresh();
    } catch (error) {
      setCadence(previous);
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function saveRetention(next: number) {
    const previous = retention;
    setRetention(next);
    setBusy(true);
    setMessage(null);
    try {
      await curatedAdminRequest("PATCH", "/api/admin/curated-articles/settings", { curatedArticlesPendingRetentionDays: next });
      router.refresh();
    } catch (error) {
      setRetention(previous);
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
        <CardTitle>Fetching &amp; publishing</CardTitle>
        <CardDescription>
          Every 6 hours the worker checks each enabled source and adds matching articles here as pending. Pending articles nobody reviews are
          cleared automatically (see below). Approved articles wait in Scheduled and are published a few at a time per community, so no community
          floods the feed; &ldquo;Post now&rdquo; skips the wait.
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
        <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Articles per community per week</p>
            <p className="text-sm text-muted-foreground">
              Spread evenly through the week. Articles not tied to a community share one &ldquo;General&rdquo; allowance.
            </p>
          </div>
          <Select value={String(cadence)} onValueChange={(v) => saveCadence(Number(v))} disabled={busy}>
            <SelectTrigger className="w-24" aria-label="Articles per community per week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_WEEK_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Keep unreviewed articles for</p>
            <p className="text-sm text-muted-foreground">
              Pending articles older than this are removed automatically. Scheduled, published and rejected articles are never removed.
            </p>
          </div>
          <Select value={String(retention)} onValueChange={(v) => saveRetention(Number(v))} disabled={busy}>
            <SelectTrigger className="w-28" aria-label="Keep unreviewed articles for">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PENDING_RETENTION_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

function ArticleCard({
  initial,
  communities,
  selection,
}: {
  initial: ExternalArticleDto;
  communities: CommunityOption[];
  /** Present on the Pending/Scheduled tabs: the bulk-action checkbox. */
  selection?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  const router = useRouter();
  const [article, setArticle] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: initial.title, excerpt: initial.excerpt, communityIds: initial.communityIds });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<string | null>(null);

  async function setStatus(status: "pending" | "approved" | "rejected", postNow = false) {
    setBusy(true);
    setError(null);
    try {
      const result = await curatedAdminRequest<{ article: ExternalArticleDto }>(
        "POST",
        `/api/admin/curated-articles/articles/${article.id}/status`,
        { status, ...(postNow ? { postNow: true } : {}) },
      );
      const now = result.article.status;
      setMovedTo(
        now === "approved"
          ? "Published: it's now in What's New."
          : now === "scheduled"
            ? "Scheduled: it'll be published in its community's next open slot (see the Scheduled tab)."
            : now === "rejected"
              ? "Rejected."
              : "Moved back to pending.",
      );
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
    <li className={`overflow-hidden rounded-lg border bg-card ${selection?.checked ? "border-primary ring-1 ring-primary" : ""}`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {selection && (
          <Checkbox
            checked={selection.checked}
            onCheckedChange={(value) => selection.onChange(value === true)}
            aria-label={`Select “${article.title}”`}
            className="mt-1 self-start"
          />
        )}
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
              <ArticleImageControls article={article} onChange={setArticle} disabled={busy} />
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
              {article.status === "scheduled" && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  {article.estimatedReleaseAt ? (
                    <span>
                      Expected to publish <ReleaseTime iso={article.estimatedReleaseAt} />
                    </span>
                  ) : (
                    <span>Queued; more than 6 months of articles are ahead of it</span>
                  )}
                </p>
              )}
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
            {(article.status === "pending" || article.status === "rejected") && (
              <Button size="sm" onClick={() => setStatus("approved")} disabled={busy}>
                <Check className="mr-1.5 h-4 w-4" />
                {article.approvedAt ? "Republish" : "Approve"}
              </Button>
            )}
            {article.status !== "approved" && !article.approvedAt && (
              <Button
                size="sm"
                variant={article.status === "scheduled" ? "default" : "outline"}
                onClick={() => setStatus("approved", true)}
                disabled={busy}
              >
                <Send className="mr-1.5 h-4 w-4" />
                Post now
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

/** "Reject all pending older than X days": counts first, then confirms. */
function RejectOlderThan() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function preview() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/curated-articles/articles/bulk?olderThanDays=${days}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't count articles.");
      if (payload.count === 0) setMessage({ tone: "ok", text: `No pending articles are older than ${days} days.` });
      else setCount(payload.count);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't count articles." });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const result = await curatedAdminRequest<{ rejected: number }>("POST", "/api/admin/curated-articles/articles/bulk", {
        action: "reject-older-than",
        days,
      });
      setMessage({ tone: "ok", text: `Rejected ${result.rejected} article${result.rejected === 1 ? "" : "s"}.` });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't reject." });
    } finally {
      setCount(null);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Label htmlFor="reject-older-days">Reject all pending older than</Label>
      <Input
        id="reject-older-days"
        type="number"
        min={1}
        max={365}
        value={days}
        onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
        className="h-8 w-20"
      />
      <span>days</span>
      <Button size="sm" variant="outline" onClick={preview} disabled={busy}>
        Reject…
      </Button>
      {message && (
        <p role="status" className={message.tone === "error" ? "text-destructive" : "text-muted-foreground"}>
          {message.text}
        </p>
      )}
      <AlertDialog open={count !== null} onOpenChange={(open) => !open && setCount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reject {count} pending article{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every pending article fetched more than {days} days ago will move to Rejected. Scheduled and published articles aren&apos;t
              affected, and you can still approve a rejected article later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={busy}>
              Reject {count}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CuratedArticleList({
  items,
  communities,
  emptyText,
  selectable = false,
  showOlderThan = false,
}: {
  items: ExternalArticleDto[];
  communities: CommunityOption[];
  emptyText: string;
  /** Pending/Scheduled tabs: checkboxes and "Reject selected". */
  selectable?: boolean;
  /** Pending tab: "Reject all pending older than X days". */
  showOlderThan?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Only ids still on screen count (a refresh may have moved some away).
  const visibleSelected = items.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allSelected = items.length > 0 && visibleSelected.length === items.length;

  async function rejectSelected() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await curatedAdminRequest<{ rejected: number }>("POST", "/api/admin/curated-articles/articles/bulk", {
        action: "reject-selected",
        ids: visibleSelected,
      });
      setMessage({ tone: "ok", text: `Rejected ${result.rejected} article${result.rejected === 1 ? "" : "s"}.` });
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn't reject." });
    } finally {
      setBusy(false);
    }
  }

  const toolbar =
    selectable && items.length > 0 ? (
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected ? true : visibleSelected.length > 0 ? "indeterminate" : false}
              onCheckedChange={(value) => setSelected(value === true ? new Set(items.map((item) => item.id)) : new Set())}
              aria-label="Select all shown"
            />
            Select all shown ({items.length})
          </label>
          <Button size="sm" variant="outline" onClick={rejectSelected} disabled={busy || visibleSelected.length === 0}>
            <X className="mr-1.5 h-4 w-4" />
            Reject selected{visibleSelected.length > 0 ? ` (${visibleSelected.length})` : ""}
          </Button>
          {message && (
            <p role="status" className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message.text}
            </p>
          )}
        </div>
        {showOlderThan && <RejectOlderThan />}
      </div>
    ) : null;

  if (items.length === 0) {
    return (
      <>
        {message && <p role="status" className="text-sm text-muted-foreground">{message.text}</p>}
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      </>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          // Keyed on status too so a refreshed list never reuses a card that already showed its "moved" note.
          <ArticleCard
            key={`${item.id}:${item.status}`}
            initial={item}
            communities={communities}
            selection={
              selectable
                ? {
                    checked: selected.has(item.id),
                    onChange: (checked) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      }),
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}

/** Per-community release queue summary above the Scheduled list. */
export function ScheduledOverviewPanel({ slots, perWeek }: { slots: ScheduledOverview["slots"]; perWeek: number }) {
  if (slots.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="px-4 pt-3 text-left text-xs text-muted-foreground">
          Up to {perWeek} per community per rolling week. Estimates assume nothing else is approved or posted in the meantime.
        </caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">Community</th>
            <th scope="col" className="px-4 py-2 font-medium">Queued</th>
            <th scope="col" className="px-4 py-2 font-medium">Published this week</th>
            <th scope="col" className="px-4 py-2 font-medium">Next release</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.slot} className="border-b last:border-0">
              <th scope="row" className="px-4 py-2 text-left font-medium">{slot.label}</th>
              <td className="px-4 py-2">{slot.queued}</td>
              <td className="px-4 py-2">
                {slot.releasedThisWeek} of {perWeek}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{slot.nextReleaseAt ? <ReleaseTime iso={slot.nextReleaseAt} /> : "Nothing queued"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
