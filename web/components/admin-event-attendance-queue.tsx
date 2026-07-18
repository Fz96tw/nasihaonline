"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EVENT_TYPE_LABELS, type PastEventForAttendance } from "@/lib/events";
import { getCsrfToken } from "@/lib/csrf-client";
import { useHasMounted } from "@/lib/use-has-mounted";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Admin queue for recording a host's Attendance on a past event (§4.4/§4.6,
 * /admin/events). Recording is a one-way action — once an event's host
 * attendance is recorded, the auto-earn ledger transaction is posted and the
 * row just shows "Recorded", it can't be undone from here.
 */
export function AdminEventAttendanceQueue({ initialEvents }: { initialEvents: PastEventForAttendance[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasMounted = useHasMounted();

  async function recordAttendance(eventId: string) {
    setPendingId(eventId);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/attendance`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setEvents((current) =>
        current.map((event) => (event.id === eventId ? { ...event, attendanceRecorded: true } : event)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (events.length === 0) {
    return (
      <p className="rounded-[10px] border bg-card py-16 text-center text-muted-foreground shadow-sm">
        No past events yet.
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
            <TableHead>Event</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>{hasMounted ? formatDate(event.startsAt) : null}</TableCell>
              <TableCell>{event.title}</TableCell>
              <TableCell>{EVENT_TYPE_LABELS[event.type]}</TableCell>
              <TableCell>{event.hostName ?? "Unknown"}</TableCell>
              <TableCell>
                {event.attendanceRecorded ? (
                  <Badge variant="success">Recorded</Badge>
                ) : (
                  <Badge variant="warning">Not recorded</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {!event.attendanceRecorded && (
                  <Button size="sm" disabled={pendingId === event.id} onClick={() => recordAttendance(event.id)}>
                    {pendingId === event.id ? "Recording…" : "Record host attendance"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
