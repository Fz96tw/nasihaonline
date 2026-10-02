"use client";

import { useEffect, useState } from "react";

// Remembers, per event, the registration id (`rid`) the server handed back
// when this browser FIRST registered for an open event — it's the guest's
// join credential for /meet/event/:id?rid=…, so with it stored the popup and
// the event page can offer "Open waiting room" / "Join now" instead of the
// register dialog. Only ever set for a first-time registration of an email
// (a repeat submission is never given the id, see the register route) and
// only for events that actually have a meeting. Per-browser by design: on
// another computer the visitor re-registers and gets the link by email.
const STORAGE_KEY = "nasiha:event-rids";
const CHANGE_EVENT = "nasiha:event-rids-changed";

function readAll(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getStoredRid(eventId: string): string | null {
  const rid = readAll()[eventId];
  return typeof rid === "string" && rid ? rid : null;
}

export function storeRid(eventId: string, rid: string) {
  try {
    const all = readAll();
    // Keep the map small — newest entries win.
    const next = Object.fromEntries(Object.entries({ ...all, [eventId]: rid }).slice(-50));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private window / blocked storage — the join link is still in the email.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function meetingPath(eventId: string, rid: string) {
  return `/meet/event/${eventId}?rid=${encodeURIComponent(rid)}`;
}

/** This browser's stored rid for an event (null until mounted / when none). Updates when another component stores one. */
export function useStoredRid(eventId: string): string | null {
  const [rid, setRid] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setRid(getStoredRid(eventId));
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [eventId]);
  return rid;
}
