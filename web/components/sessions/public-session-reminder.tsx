"use client";

import { useAuth } from "@clerk/nextjs";
import { QueryProvider } from "@/components/providers/query-provider";
import { SessionReminder } from "@/components/sessions/session-reminder";

/**
 * Signed-out counterpart of the member layout's SessionReminder, mounted in
 * the marketing layout. Signed-in members get their own (RSVP-based)
 * reminder in the member layout, so this renders nothing for them.
 */
export function PublicSessionReminder() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || isSignedIn) return null;
  return (
    <QueryProvider>
      <SessionReminder
        variant="public"
        storageKey="nasiha:public-session-reminder-prefs"
      />
    </QueryProvider>
  );
}
