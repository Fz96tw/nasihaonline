"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRIVACY_REQUEST_TYPE_LABELS, type PrivacyRequestTypeValue, type PrivacyRequestView } from "@/lib/privacy";
import { getCsrfToken } from "@/lib/csrf-client";

const STATUS_BADGE_VARIANT: Record<PrivacyRequestView["status"], "warning" | "success" | "neutral"> = {
  pending: "warning",
  fulfilled: "success",
  rejected: "neutral",
};

const DELETION_CONFIRM_MESSAGE =
  "Request deletion of your personal data? An admin will review and process this manually. Your Knowledge Hours ledger entries and any published content will be retained (attribution may be de-identified) to preserve the community's audit trail — see the Privacy Policy for details.";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PrivacyRequestsSection({ initialRequests }: { initialRequests: PrivacyRequestView[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [submittingType, setSubmittingType] = useState<PrivacyRequestTypeValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPending = (type: PrivacyRequestTypeValue) =>
    requests.some((request) => request.type === type && request.status === "pending");

  async function submitRequest(type: PrivacyRequestTypeValue) {
    if (type === "deletion" && !window.confirm(DELETION_CONFIRM_MESSAGE)) return;

    setSubmittingType(type);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/privacy/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const { privacyRequest } = await res.json();
      setRequests((current) => [
        {
          id: privacyRequest.id,
          type: privacyRequest.type,
          status: privacyRequest.status,
          requestedAt: privacyRequest.requestedAt,
          fulfilledAt: privacyRequest.fulfilledAt,
        },
        ...current,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmittingType(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Request an export or deletion of your personal data. Requests are reviewed and fulfilled by an
        admin — see the{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>{" "}
        for details.
      </p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={submittingType === "export" || hasPending("export")}
          onClick={() => submitRequest("export")}
        >
          {hasPending("export") ? "Export request pending" : "Request data export"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={submittingType === "deletion" || hasPending("deletion")}
          onClick={() => submitRequest("deletion")}
        >
          {hasPending("deletion") ? "Deletion request pending" : "Request account deletion"}
        </Button>
      </div>

      {requests.length > 0 && (
        <ul className="flex flex-col gap-2">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex items-center justify-between gap-2 rounded-[10px] border p-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{PRIVACY_REQUEST_TYPE_LABELS[request.type]}</span>
                <span className="text-xs text-muted-foreground">
                  Requested {formatDate(request.requestedAt)}
                  {request.fulfilledAt ? ` · Fulfilled ${formatDate(request.fulfilledAt)}` : ""}
                </span>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[request.status]}>{request.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
