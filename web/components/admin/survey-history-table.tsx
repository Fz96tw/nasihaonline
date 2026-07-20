"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format-date";
import { getCsrfToken } from "@/lib/csrf-client";
import type { SurveyHistoryItem } from "@/lib/surveys-server";

const STATUS_BADGE: Record<SurveyHistoryItem["status"], { label: string; variant: "neutral" | "info" | "success" }> = {
  draft: { label: "Draft", variant: "neutral" },
  scheduled: { label: "Scheduled", variant: "info" },
  open: { label: "Open", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
};

/**
 * Admin history list — every Survey regardless of status, unlike
 * AnnouncementHistoryTable (which only shows sent announcements), since a
 * draft is a real resumable state here. Close/reopen mutate the row's
 * status in place (that's still legal post-send, unlike editing content) —
 * everything else (Edit, Use as template) routes to a dedicated page.
 */
export function SurveyHistoryTable({ surveys }: { surveys: SurveyHistoryItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function closeNow(survey: SurveyHistoryItem) {
    if (!window.confirm(`Close "${survey.title}"? No further responses will be accepted until you reopen it.`)) {
      return;
    }
    setPendingId(survey.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/surveys/${survey.id}/close`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("Failed to close");
      router.refresh();
    } catch {
      setError("Failed to close. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function reopen(survey: SurveyHistoryItem) {
    const raw = window.prompt(
      `Reopen "${survey.title}". Auto-close after how many days? Leave blank to stay open until you close it manually.`,
      "",
    );
    if (raw === null) return; // cancelled
    const durationDays = raw.trim() === "" ? null : Number(raw.trim());
    if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1)) {
      setError("Duration must be a whole number of days.");
      return;
    }

    setPendingId(survey.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/surveys/${survey.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ durationDays }),
      });
      if (!res.ok) throw new Error("Failed to reopen");
      router.refresh();
    } catch {
      setError("Failed to reopen. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Sent / Responded</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No surveys yet.
                </TableCell>
              </TableRow>
            )}
            {surveys.map((survey) => {
              const badge = STATUS_BADGE[survey.status];
              const hasInvitations = survey.status === "open" || survey.status === "closed";
              return (
                <TableRow key={survey.id}>
                  <TableCell className="font-medium">{survey.title}</TableCell>
                  <TableCell>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{survey.audienceSummary.join(", ")}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {hasInvitations ? `${survey.sentCount} / ${survey.respondedCount}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatTimestamp(survey.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{survey.authorName}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {survey.status === "draft" && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/admin/surveys/${survey.id}/edit`}>Edit</Link>
                        </Button>
                      )}
                      {hasInvitations && (
                        <>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/surveys/${survey.id}/recipients`}>Recipients</Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/surveys/${survey.id}/responses`}>Responses</Link>
                          </Button>
                        </>
                      )}
                      {survey.status === "open" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={pendingId === survey.id}
                          onClick={() => closeNow(survey)}
                        >
                          Close
                        </Button>
                      )}
                      {survey.status === "closed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pendingId === survey.id}
                          onClick={() => reopen(survey)}
                        >
                          Reopen
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/surveys/new?fromId=${survey.id}`}>Use as template</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
