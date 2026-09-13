"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

export type ActivityType = "Blog" | "Library" | "Event" | "Forum" | "Meeting";

export type ActivityRow = {
  id: string;
  type: ActivityType;
  title: string;
  meta?: string;
  status: { label: string; variant: BadgeVariant };
  date: string;
  href: string;
  actionLabel: "Edit" | "View";
};

/**
 * Cross-domain activity table shared by the All/Blog/Events/Forum tabs
 * (Library keeps its own MySubmissionsTable, reused from /library/mine).
 * `showType` distinguishes the All tab's merged view; `metaHeader` adds an
 * extra column for domain-specific context (e.g. Forum's thread's forum
 * name) without forcing every tab to carry an unused column.
 *
 * `enableDraftFilter` (Save as Draft initiative) adds an All/Drafts chip
 * row, isolating rows whose status.label is "Draft" — passed only by the
 * Events tab today (the one domain here with a draft concept), hidden
 * entirely when the row set has no drafts so it doesn't clutter every
 * other tab.
 */
export function ActivityTable({
  rows,
  showType = false,
  metaHeader,
  emptyMessage,
  enableDraftFilter = false,
}: {
  rows: ActivityRow[];
  showType?: boolean;
  metaHeader?: string;
  emptyMessage: string;
  enableDraftFilter?: boolean;
}) {
  const [draftsOnly, setDraftsOnly] = useState(false);
  const hasDrafts = enableDraftFilter && rows.some((row) => row.status.label === "Draft");
  const visibleRows = draftsOnly && hasDrafts ? rows.filter((row) => row.status.label === "Draft") : rows;

  const colSpan = 4 + (showType ? 1 : 0) + (metaHeader ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      {hasDrafts && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={!draftsOnly ? "default" : "outline"} onClick={() => setDraftsOnly(false)}>
            All
          </Button>
          <Button type="button" size="sm" variant={draftsOnly ? "default" : "outline"} onClick={() => setDraftsOnly(true)}>
            Drafts
          </Button>
        </div>
      )}
      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {showType && <TableHead>Type</TableHead>}
              <TableHead>Title</TableHead>
              {metaHeader && <TableHead>{metaHeader}</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  {draftsOnly ? "No drafts." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((row) => (
              <TableRow key={`${row.type}-${row.id}`}>
                {showType && <TableCell className="text-muted-foreground">{row.type}</TableCell>}
                <TableCell className="font-medium">{row.title}</TableCell>
                {metaHeader && <TableCell className="text-muted-foreground">{row.meta}</TableCell>}
                <TableCell>
                  <Badge variant={row.status.variant}>{row.status.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(row.date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Link href={row.href} className="text-sm text-primary hover:underline">
                    {row.actionLabel}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
