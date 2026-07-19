"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format-date";
import { getCsrfToken } from "@/lib/csrf-client";
import type { AnnouncementHistoryItem } from "@/lib/announcements-server";

/**
 * Internal record of past Board Announcements — the real sending admin's
 * name, unmasked, unlike the member-facing "NASIHA Board" identity shown in
 * the feed/detail page/email (lib/feed-server.ts's ANNOUNCEMENT_SENDER).
 * Retracted announcements stay listed (with who/when retracted) rather than
 * disappearing — no edit, since a sent Announcement's content can't change,
 * only be retracted.
 */
export function AnnouncementHistoryTable({ announcements }: { announcements: AnnouncementHistoryItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retract(announcement: AnnouncementHistoryItem) {
    if (
      !window.confirm(
        `Retract "${announcement.title}"? It will disappear from members' feeds and notifications — the email already sent can't be undone.`,
      )
    ) {
      return;
    }

    setPendingId(announcement.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/announcements/${announcement.id}/retract`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("Failed to retract");
      router.refresh();
    } catch {
      setError("Failed to retract. Please try again.");
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
              <TableHead>Sent</TableHead>
              <TableHead>Sent by</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {announcements.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No announcements sent yet.
                </TableCell>
              </TableRow>
            )}
            {announcements.map((announcement) => (
              <TableRow key={announcement.id}>
                <TableCell className="font-medium">{announcement.title}</TableCell>
                <TableCell className="text-muted-foreground">{formatTimestamp(announcement.sentAt)}</TableCell>
                <TableCell className="text-muted-foreground">{announcement.authorName}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {announcement.showInFeed && <Badge variant="neutral">Feed</Badge>}
                    {announcement.notifyInApp && <Badge variant="neutral">Bell</Badge>}
                    {announcement.sendEmail && <Badge variant="neutral">Email</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {announcement.retractedAt ? (
                    <Badge variant="neutral">
                      Retracted {formatTimestamp(announcement.retractedAt)}
                      {announcement.retractedByName ? ` by ${announcement.retractedByName}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="success">Live</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!announcement.retractedAt && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pendingId === announcement.id}
                      onClick={() => retract(announcement)}
                    >
                      Retract
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
