import type { PublicReminderState, ReminderSession, ReminderState } from "@/lib/session-reminders";

// Display text shared by the floating popup and the phone drawer.

export function formatStartTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Member popup / drawer ("soon" | "live"). */
export function timingText(session: ReminderSession, state: ReminderState, now: number) {
  const start = Date.parse(session.startsAt);
  if (state === "soon") {
    const minutes = Math.ceil((start - now) / 60_000);
    return `Starts at ${formatStartTime(session.startsAt)} · in ${minutes} min`;
  }
  const minutes = Math.floor((now - start) / 60_000);
  return minutes < 1 ? "Just started" : `Started ${minutes} min ago`;
}

/** Signed-out popup / strip / drawer ("soon" | "waiting" | "started"). */
export function publicTimingText(session: ReminderSession, state: PublicReminderState, now: number) {
  const start = Date.parse(session.startsAt);
  if (state === "soon") {
    const minutes = Math.ceil((start - now) / 60_000);
    return `Starts at ${formatStartTime(session.startsAt)} · in ${minutes} min`;
  }
  if (state === "waiting") return `Scheduled for ${formatStartTime(session.startsAt)} · the host hasn't started yet`;
  const minutes = Math.floor((now - start) / 60_000);
  return minutes < 1 ? "Just started" : `Started ${minutes} min ago`;
}
