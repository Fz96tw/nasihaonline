"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ContributionPendingEntry } from "@/lib/contributions";
import { rejectContributionSchema } from "@/lib/validation/contribution";
import { getCsrfToken } from "@/lib/csrf-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Admin review queue for pending contributions (§4.4, /admin/ledger). Admins
 * can confirm/reject any pending entry, but the ones with no
 * `counterpartName` are the ones that *require* admin action since there's
 * no peer counterpart to do it. Rejecting from here is always the admin's
 * own action (never the named counterpart's), so a reason is required —
 * same audit requirement as application rejection.
 */
export function AdminLedgerQueue({ initialEntries }: { initialEntries: ContributionPendingEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ContributionPendingEntry | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function confirm(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/contributions/${id}/confirm`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setEntries((current) => current.filter((entry) => entry.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const parsed = rejectContributionSchema.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? "A reason is required.");
      return;
    }

    setPendingId(rejectTarget.id);
    setReasonError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/contributions/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ reason: parsed.data.reason }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setEntries((current) => current.filter((entry) => entry.id !== rejectTarget.id));
      setRejectTarget(null);
      setReason("");
    } catch (err) {
      setReasonError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-[10px] border bg-card py-16 text-center text-muted-foreground shadow-sm">
        No pending contributions to review.
      </p>
    );
  }

  return (
    <div className="rounded-[10px] border bg-card shadow-sm">
      {error && <p className="p-4 text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead>Submitted by</TableHead>
            <TableHead>Counterpart</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>{formatDate(entry.date)}</TableCell>
              <TableCell>{entry.activity}</TableCell>
              <TableCell>{entry.actorName}</TableCell>
              <TableCell className="text-muted-foreground">
                {entry.counterpartName ?? "— (admin required)"}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{entry.hours}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === entry.id}
                  onClick={() => {
                    setRejectTarget(entry);
                    setReason("");
                    setReasonError(null);
                  }}
                >
                  Reject
                </Button>
                <Button size="sm" disabled={pendingId === entry.id} onClick={() => confirm(entry.id)}>
                  Confirm
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setRejectTarget(null);
            setReason("");
            setReasonError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject contribution</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Rejecting {rejectTarget.actorName}&apos;s &ldquo;{rejectTarget.activity}&rdquo; entry. It stays in
                  their history but contributes 0 hours. A reason is required for the audit trail.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this being rejected?"
          />
          {reasonError && <p className="text-sm text-destructive">{reasonError}</p>}

          <DialogFooter>
            <Button variant="destructive" disabled={pendingId === rejectTarget?.id} onClick={submitReject}>
              {pendingId === rejectTarget?.id ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
