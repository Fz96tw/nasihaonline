"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tier } from "@/lib/generated/prisma/enums";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { getCsrfToken } from "@/lib/csrf-client";

export function AdminApplicationReviewForm({
  applicationId,
  requestedTier,
}: {
  applicationId: string;
  requestedTier: Tier | null;
}) {
  const router = useRouter();
  // Pre-filled from the applicant's own (non-binding) preference — the admin
  // can still change it before approving.
  const [tier, setTier] = useState<Tier | "">(requestedTier ?? "");
  const [adminNote, setAdminNote] = useState("");
  const [visibleToApplicant, setVisibleToApplicant] = useState(false);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Approval flips the application out of "pending" status, which unmounts
  // this form on refresh — so the email-send outcome is held here and shown
  // before the admin dismisses it, rather than being refreshed away unseen.
  const [approvedEmailStatus, setApprovedEmailStatus] = useState<{ ok: boolean; error?: string } | null>(null);

  async function submit(body: Record<string, unknown>, kind: "approve" | "reject") {
    setPending(kind);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ? JSON.stringify(payload.error) : "Request failed");
      }
      if (kind === "approve") {
        setApprovedEmailStatus(payload?.emailStatus ?? { ok: false, error: "No status returned" });
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (approvedEmailStatus) {
    return (
      <div className="rounded-[10px] border p-4">
        <p className="text-sm font-medium">Application approved and account created.</p>
        {approvedEmailStatus.ok ? (
          <p className="mt-1 text-sm text-muted-foreground">Welcome email sent to the applicant.</p>
        ) : (
          <p className="mt-1 text-sm text-destructive">
            Welcome email failed to send: {approvedEmailStatus.error}. Use &quot;Resend invite email&quot; on this
            page after continuing, or check server logs.
          </p>
        )}
        <Button className="mt-3" size="sm" onClick={() => router.refresh()}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-[10px] border p-4">
        <h3 className="text-sm font-semibold">Approve</h3>
        <Select value={tier} onValueChange={(value) => setTier(value as Tier)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a tier" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(Tier).map((value) => (
              <SelectItem key={value} value={value}>
                {TIER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!tier || pending !== null}
          onClick={() => submit({ action: "approve", tier }, "approve")}
        >
          {pending === "approve" ? "Approving…" : "Approve & Create Account"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-[10px] border p-4">
        <h3 className="text-sm font-semibold">Reject</h3>
        <Textarea
          placeholder="Reason for rejection (required)"
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={visibleToApplicant}
            onCheckedChange={(checked) => setVisibleToApplicant(checked === true)}
          />
          Visible to applicant
        </label>
        <Button
          variant="destructive"
          disabled={!adminNote.trim() || pending !== null}
          onClick={() => submit({ action: "reject", adminNote, visibleToApplicant }, "reject")}
        >
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
    </div>
  );
}
