"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONDUCT_ACTION_LABELS, type ConductNoticeView } from "@/lib/conduct";
import { getCsrfToken } from "@/lib/csrf-client";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ConductNoticesSection({ initialNotices }: { initialNotices: ConductNoticeView[] }) {
  const [notices, setNotices] = useState(initialNotices);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge(notice: ConductNoticeView) {
    setPendingId(notice.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/conduct/notices/${notice.id}/acknowledge`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const { acknowledgedAt } = await res.json();
      setNotices((current) =>
        current.map((existing) => (existing.id === notice.id ? { ...existing, acknowledgedAt } : existing)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {notices.map((notice) => (
          <li key={notice.id} className="flex flex-col gap-2 rounded-[10px] border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={notice.actionTaken === "warning" ? "warning" : "danger"}>
                  {CONDUCT_ACTION_LABELS[notice.actionTaken]}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(notice.actionTakenAt)}</span>
              </div>
              {!notice.acknowledgedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === notice.id}
                  onClick={() => acknowledge(notice)}
                >
                  Acknowledge
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{notice.description}</p>
            {notice.acknowledgedAt && (
              <span className="text-xs text-muted-foreground">
                Acknowledged {formatDate(notice.acknowledgedAt)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
