import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format-date";
import type { AnnouncementHistoryItem } from "@/lib/announcements-server";

/**
 * Internal record of past Board Announcements — the real sending admin's
 * name, unmasked, unlike the member-facing "NASIHA Board" identity shown in
 * the feed/detail page/email (lib/feed-server.ts's ANNOUNCEMENT_SENDER).
 * Read-only: no edit/delete, since a sent Announcement can't be un-sent.
 */
export function AnnouncementHistoryTable({ announcements }: { announcements: AnnouncementHistoryItem[] }) {
  return (
    <div className="rounded-[10px] border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Sent by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {announcements.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No announcements sent yet.
              </TableCell>
            </TableRow>
          )}
          {announcements.map((announcement) => (
            <TableRow key={announcement.id}>
              <TableCell className="font-medium">{announcement.title}</TableCell>
              <TableCell className="text-muted-foreground">{formatTimestamp(announcement.sentAt)}</TableCell>
              <TableCell className="text-muted-foreground">{announcement.authorName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
