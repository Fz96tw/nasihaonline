"use client";

import { useAuth } from "@clerk/nextjs";
import { SessionReminder } from "@/components/sessions/session-reminder";

/**
 * The floating "starting soon / started" reminder on the marketing pages
 * (the marketing layout provides the QueryProvider). Signed-out visitors get
 * the public three-state popup; a signed-in member gets their own RSVP-based
 * reminder — the same one the member layout mounts, which otherwise never
 * appears on these pages (the marketing layout isn't the member layout).
 */
export function PublicSessionReminder() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <SessionReminder />;
  return <SessionReminder variant="public" storageKey="nasiha:public-session-reminder-prefs" />;
}
