"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CONDUCT_ACTION_LABELS, type ConductAction, type OpenConductReportView } from "@/lib/conduct";
import { getCsrfToken } from "@/lib/csrf-client";

const ACTION_BADGE_VARIANT: Record<ConductAction, "warning" | "danger"> = {
  warning: "warning",
  suspension: "danger",
  removal: "danger",
};

const ACTION_CONFIRM: Record<ConductAction, string | null> = {
  warning: null,
  suspension: "Suspend this member? They will immediately lose sign-in and member access.",
  removal:
    "Remove this member? This permanently suspends their account (members are never hard-deleted, per the immutable ledger).",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ConductReportQueue({ initialReports }: { initialReports: OpenConductReportView[] }) {
  const [reports, setReports] = useState(initialReports);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recordAction(report: OpenConductReportView, action: ConductAction) {
    const confirmMessage = ACTION_CONFIRM[action];
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setPendingId(report.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/conduct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ id: report.id, action }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setReports((current) => current.filter((existing) => existing.id !== report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No open conduct reports right now.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {reports.map((report) => (
        <Card key={report.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
              <span className="font-medium">
                Report against {report.reportedUser.name ?? report.reportedUser.email}
              </span>
              <span className="text-xs text-muted-foreground">
                Reported by {report.reporter ? (report.reporter.name ?? report.reporter.email) : "System"}
              </span>
            </div>
            {report.priorViolations.length > 0 && (
              <Badge variant="warning" className="shrink-0 whitespace-nowrap">
                {report.priorViolations.length} prior violation
                {report.priorViolations.length === 1 ? "" : "s"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{report.description}</p>

            {report.priorViolations.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-[10px] border bg-muted/40 p-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Prior violation history
                </span>
                {report.priorViolations.map((violation) => (
                  <div key={violation.id} className="flex items-center gap-2 text-xs">
                    <Badge variant={ACTION_BADGE_VARIANT[violation.actionTaken]}>
                      {CONDUCT_ACTION_LABELS[violation.actionTaken]}
                    </Badge>
                    <span className="text-muted-foreground">{formatDate(violation.actionTakenAt)}</span>
                    <span className="truncate text-muted-foreground">{violation.description}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === report.id}
                onClick={() => recordAction(report, "warning")}
              >
                Warning
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pendingId === report.id}
                onClick={() => recordAction(report, "suspension")}
              >
                Suspend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pendingId === report.id}
                onClick={() => recordAction(report, "removal")}
              >
                Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
