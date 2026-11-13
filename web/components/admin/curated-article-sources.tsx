"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format-date";
import { ARTICLE_SOURCE_KIND_LABELS, type ArticleSourceDto, type CommunityOption } from "@/lib/curated-articles";
import { articleSourceSchema, splitKeywords, type ArticleSourceInput } from "@/lib/validation/curated-articles";
import { CommunityPicker, communityNames, curatedAdminRequest } from "@/components/admin/curated-articles-shared";

const EMPTY_SOURCE: ArticleSourceInput = {
  name: "",
  kind: "rss",
  url: "",
  includeKeywords: [],
  excludeKeywords: [],
  enabled: true,
  communityIds: [],
};

function SourceForm({
  initial,
  sourceId,
  communities,
  onDone,
}: {
  initial: ArticleSourceInput;
  sourceId?: string;
  communities: CommunityOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [includeText, setIncludeText] = useState(initial.includeKeywords.join(", "));
  const [excludeText, setExcludeText] = useState(initial.excludeKeywords.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idPrefix = sourceId ?? "new";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = articleSourceSchema.safeParse({
      ...values,
      includeKeywords: splitKeywords(includeText),
      excludeKeywords: splitKeywords(excludeText),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (sourceId) await curatedAdminRequest("PUT", `/api/admin/curated-articles/sources/${sourceId}`, parsed.data);
      else await curatedAdminRequest("POST", "/api/admin/curated-articles/sources", parsed.data);
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the source.");
    } finally {
      setBusy(false);
    }
  }

  const isSearch = values.kind === "news_search";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input
            id={`${idPrefix}-name`}
            value={values.name}
            placeholder="e.g. ScienceDaily: Health"
            onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">For feeds, also shown to members as &ldquo;Read on …&rdquo;.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-kind`}>Type</Label>
          <Select value={values.kind} onValueChange={(kind) => setValues((prev) => ({ ...prev, kind: kind as ArticleSourceInput["kind"] }))}>
            <SelectTrigger id={`${idPrefix}-kind`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ARTICLE_SOURCE_KIND_LABELS) as ArticleSourceInput["kind"][]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {ARTICLE_SOURCE_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-url`}>{isSearch ? "Search words" : "Feed URL"}</Label>
        <Input
          id={`${idPrefix}-url`}
          value={values.url}
          inputMode={isSearch ? "text" : "url"}
          placeholder={isSearch ? "e.g. students community project" : "https://example.org/feed"}
          onChange={(e) => setValues((prev) => ({ ...prev, url: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          {isSearch
            ? "Searched on Bing News. Plain words work best; quoted phrases often return nothing."
            : "The site's RSS or Atom feed, often linked as “RSS” or found at /feed."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-include`}>Only keep articles mentioning</Label>
          <Textarea
            id={`${idPrefix}-include`}
            rows={2}
            value={includeText}
            placeholder="Leave empty to keep everything"
            onChange={(e) => setIncludeText(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-exclude`}>Skip articles mentioning</Label>
          <Textarea id={`${idPrefix}-exclude`} rows={2} value={excludeText} onChange={(e) => setExcludeText(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Separate keywords with commas. Matched as whole words in the headline and summary, ignoring case.
      </p>
      <CommunityPicker
        communities={communities}
        value={values.communityIds}
        onChange={(communityIds) => setValues((prev) => ({ ...prev, communityIds }))}
        disabled={busy}
        label="Tag its articles with"
      />
      <div className="flex items-center gap-2">
        <Switch
          id={`${idPrefix}-enabled`}
          checked={values.enabled}
          onCheckedChange={(enabled) => setValues((prev) => ({ ...prev, enabled }))}
        />
        <Label htmlFor={`${idPrefix}-enabled`}>Enabled</Label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : sourceId ? "Save source" : "Add source"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

function SourceRow({ source, communities }: { source: ArticleSourceDto; communities: CommunityOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(source.enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, okText?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (okText) setMessage({ tone: "ok", text: okText });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border bg-card p-4">
        <SourceForm
          sourceId={source.id}
          communities={communities}
          initial={{
            name: source.name,
            kind: source.kind,
            url: source.url,
            includeKeywords: source.includeKeywords,
            excludeKeywords: source.excludeKeywords,
            enabled: source.enabled,
            communityIds: source.communityIds,
          }}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  const names = communityNames(communities, source.communityIds);
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{source.name}</h3>
            <Badge variant="neutral">{ARTICLE_SOURCE_KIND_LABELS[source.kind]}</Badge>
            {!enabled && <Badge variant="neutral">Disabled</Badge>}
          </div>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">{source.url}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          aria-label={`${source.name} enabled`}
          onCheckedChange={(next) => {
            setEnabled(next);
            void run(() =>
              curatedAdminRequest("PATCH", `/api/admin/curated-articles/sources/${source.id}`, { enabled: next }).catch((error) => {
                setEnabled(!next);
                throw error;
              }),
            );
          }}
        />
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">Communities: </dt>
          <dd className="inline">{names.length ? names.join(", ") : "All members"}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Articles: </dt>
          <dd className="inline">
            {source.pendingCount} pending, {source.approvedCount} approved
          </dd>
        </div>
        {source.includeKeywords.length > 0 && (
          <div>
            <dt className="inline text-muted-foreground">Only: </dt>
            <dd className="inline">{source.includeKeywords.join(", ")}</dd>
          </div>
        )}
        {source.excludeKeywords.length > 0 && (
          <div>
            <dt className="inline text-muted-foreground">Skip: </dt>
            <dd className="inline">{source.excludeKeywords.join(", ")}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-muted-foreground">Last checked: </dt>
          <dd className="inline">
            {source.lastFetchedAt ? formatRelativeTime(source.lastFetchedAt) : "never"}
            {source.lastSuccessAt && source.lastNewCount !== null && !source.lastError ? ` · ${source.lastNewCount} new` : ""}
          </dd>
        </div>
      </dl>
      {source.lastError && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>
            Last fetch failed{source.consecutiveFailures > 1 ? ` (${source.consecutiveFailures} times in a row)` : ""}: {source.lastError}
          </span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
          <Pencil className="mr-1.5 h-4 w-4" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !enabled}
          onClick={() =>
            run(
              () => curatedAdminRequest("POST", "/api/admin/curated-articles/fetch", { sourceIds: [source.id] }),
              "Fetch queued. Refresh in a minute to see the result.",
            )
          }
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Fetch now
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {source.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops being fetched. Articles it already added stay where they are, including approved ones in the feed. To pause it
                instead, switch it off.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => curatedAdminRequest("DELETE", `/api/admin/curated-articles/sources/${source.id}`))}>
                Delete source
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {message.text}
          </p>
        )}
      </div>
    </li>
  );
}

export function ArticleSourceManager({ sources, communities }: { sources: ArticleSourceDto[]; communities: CommunityOption[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a source</CardTitle>
          <CardDescription>A publisher&apos;s RSS/Atom feed, or a news search. New matches go to the review queue as pending.</CardDescription>
        </CardHeader>
        <CardContent>
          {adding ? (
            <SourceForm initial={EMPTY_SOURCE} communities={communities} onDone={() => setAdding(false)} />
          ) : (
            <Button onClick={() => setAdding(true)}>Add source</Button>
          )}
        </CardContent>
      </Card>
      {sources.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No sources yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} communities={communities} />
          ))}
        </ul>
      )}
    </div>
  );
}
