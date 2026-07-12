"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type ContributionPendingEntry } from "@/lib/contributions";
import { getCsrfToken } from "@/lib/csrf-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Peer confirmation UI for pending contributions naming the current member as
 * counterpart (§4.4). Shares the ["contributions-history"] query with the
 * rest of /contributions so a Confirm/Reject here also refreshes the balance
 * and history table.
 */
export function PendingConfirmations({ entries }: { entries: ContributionPendingEntry[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
      await queryClient.invalidateQueries({ queryKey: ["contributions-history"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Awaiting your confirmation</CardTitle>
        <CardDescription>
          You were named as the counterpart on these. Confirm to add them to the submitter&apos;s balance,
          or reject if they didn&apos;t happen as described.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Submitted by</TableHead>
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
      </CardContent>
    </Card>
  );
}
