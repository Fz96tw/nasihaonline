"use client";

import { useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import { MIN_ATTENDANCE_MINUTES, type AttendanceChecklistMember } from "@/lib/events";

/**
 * Host/admin-facing post-event attendance checklist for a restricted or
 * Nasiha Conference event (Audience-Restricted Group Events, Objective 04;
 * meeting minutes from getEventAttendanceChecklist) — marking a member
 * attended immediately posts their confirmed Knowledge Hours earn, same
 * one-way "can't be undone from here" shape as AdminEventAttendanceQueue's
 * host row.
 */
export function AttendanceChecklist({
  eventId,
  occurrenceDate,
  initialMembers,
}: {
  eventId: string;
  /** ISO instant of the specific session this checklist is for (the master's own startsAt for a non-recurring event). */
  occurrenceDate: string;
  initialMembers: AttendanceChecklistMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markAttended(userId: string) {
    setPendingId(userId);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/attendance/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ userId, occurrenceDate }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setMembers((current) => current.map((m) => (m.userId === userId ? { ...m, recorded: true } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  if (members.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      <h2 className="text-sm font-semibold">Record attendance</h2>
      <p className="text-xs text-muted-foreground">
        Marking a member attended posts their Knowledge Hours right away — this can&apos;t be undone.
        {members.some((m) => m.minutesAttended !== null) &&
          ` Members need at least ${MIN_ATTENDANCE_MINUTES} minutes in the meeting to qualify.`}
      </p>
      <ul className="flex flex-col divide-y">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
              <span className="truncate text-sm">{member.name ?? "A member"}</span>
              {member.minutesAttended !== null && (
                <span className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Time in the meeting">
                  <Clock className="h-3 w-3" aria-hidden />
                  {member.minutesAttended === 0 ? "Didn't join" : `${member.minutesAttended} min`}
                </span>
              )}
            </div>
            {member.recorded ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Attended
              </span>
            ) : member.isSelf ? (
              <span className="flex-shrink-0 text-xs text-muted-foreground">You — the host confirms</span>
            ) : !member.eligible ? (
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {member.minutesAttended !== null ? `Under ${MIN_ATTENDANCE_MINUTES} min` : "Not eligible"}
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pendingId === member.userId}
                onClick={() => markAttended(member.userId)}
              >
                {pendingId === member.userId ? "Recording…" : "Mark attended"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
