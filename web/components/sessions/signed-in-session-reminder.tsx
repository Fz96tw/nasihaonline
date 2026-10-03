"use client";

import { QueryProvider } from "@/components/providers/query-provider";
import { SessionReminder } from "@/components/sessions/session-reminder";

/**
 * The member's floating reminder popup for layouts that have no QueryProvider
 * of their own — (default) and /admin, which render SiteHeader (and so the top
 * strip) but not the (member) layout's popup. The caller mounts it for a
 * signed-in, non-suspended user only (the reminder polls an auth-required
 * endpoint).
 */
export function SignedInSessionReminder() {
  return (
    <QueryProvider>
      <SessionReminder />
    </QueryProvider>
  );
}
