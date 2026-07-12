"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type ContributionPendingEntry } from "@/lib/contributions";
import { getCsrfToken } from "@/lib/csrf-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Admin review queue for pending contributions (§4.4, /admin/ledger). Admins
 * can confirm/reject any pending entry, but the ones with no
 * `counterpartName` are the ones that *require* admin action since there's
 * no peer counterpart to do it.
 */
export function AdminLedgerQueue({ initialEntries }: { initialEntries: ContributionPendingEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, action: "confirm" | "reject") {
    setPendingId(id);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/contributions/${id}/${action}`, {
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
                  onClick={() => resolve(entry.id, "reject")}
                >
                  Reject
                </Button>
                <Button size="sm" disabled={pendingId === entry.id} onClick={() => resolve(entry.id, "confirm")}>
                  Confirm
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
