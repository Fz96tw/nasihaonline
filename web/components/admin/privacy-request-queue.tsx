"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PRIVACY_REQUEST_TYPE_LABELS, type OpenPrivacyRequestView } from "@/lib/privacy";
import { getCsrfToken } from "@/lib/csrf-client";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function confirmMessage(request: OpenPrivacyRequestView) {
  return request.type === "deletion"
    ? "Mark this deletion request fulfilled? Only confirm after the member's profile PII has actually been deleted or anonymized offline — their Knowledge Hours ledger entries and content attribution stay in place regardless."
    : "Mark this export request fulfilled? Only confirm after the data export has actually been delivered to the member.";
}

export function PrivacyRequestQueue({ initialRequests }: { initialRequests: OpenPrivacyRequestView[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markFulfilled(request: OpenPrivacyRequestView) {
    if (!window.confirm(confirmMessage(request))) return;

    setPendingId(request.id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/privacy-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ id: request.id }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setRequests((current) => current.filter((existing) => existing.id !== request.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No open privacy requests right now.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{formatDate(request.requestedAt)}</span>
              <span className="font-medium">{request.user.name ?? request.user.email}</span>
              <span className="text-xs text-muted-foreground">{request.user.email}</span>
            </div>
            <Badge variant={request.type === "deletion" ? "danger" : "info"} className="shrink-0 whitespace-nowrap">
              {PRIVACY_REQUEST_TYPE_LABELS[request.type]}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {request.hasRetainedHistory && (
              <div className="flex flex-col gap-1 rounded-[10px] border bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wide">Immutable history on file</span>
                <span>
                  This member has Knowledge Hours ledger entries and/or published content. Per §4.4, those
                  rows are never deleted or hidden — only profile PII can be deleted or anonymized;
                  ledger and content attribution must be retained (de-identified where appropriate) for
                  audit integrity.
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === request.id}
                onClick={() => markFulfilled(request)}
              >
                Mark fulfilled
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
