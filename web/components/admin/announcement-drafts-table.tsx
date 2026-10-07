"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format-date";
import { getCsrfToken } from "@/lib/csrf-client";
import type { AnnouncementDraft } from "@/lib/announcements-server";

/** Unsent announcement drafts awaiting an admin's review — nobody has been notified and nothing shows in the feed until one is published. */
export function AnnouncementDraftsTable({ drafts }: { drafts: AnnouncementDraft[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(draft: AnnouncementDraft, action: "publish" | "discard") {
    const message =
      action === "publish"
        ? `Publish "${draft.title}" to every member now? This can't be undone or un-sent.`
        : `Discard the draft "${draft.title}"? This can't be undone.`;
    if (!window.confirm(message)) return;

    setPendingId(draft.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(
        action === "publish" ? `/api/admin/announcements/${draft.id}/publish` : `/api/admin/announcements/${draft.id}`,
        { method: action === "publish" ? "POST" : "DELETE", headers: { "x-csrf-token": csrfToken } },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((draft) => (
              <TableRow key={draft.id}>
                <TableCell className="font-medium">{draft.title}</TableCell>
                <TableCell className="text-muted-foreground">{formatTimestamp(draft.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {draft.showInFeed && <Badge variant="neutral">Feed</Badge>}
                    {draft.notifyInApp && <Badge variant="neutral">Bell</Badge>}
                    {draft.sendEmail && <Badge variant="neutral">Email</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/announcements/drafts/${draft.id}`}>Review &amp; edit</Link>
                    </Button>
                    <Button size="sm" disabled={pendingId === draft.id} onClick={() => act(draft, "publish")}>
                      Approve &amp; publish
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pendingId === draft.id}
                      onClick={() => act(draft, "discard")}
                    >
                      Discard
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
