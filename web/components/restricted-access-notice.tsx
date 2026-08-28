import { Shield } from "lucide-react";

/**
 * Shown at the top of a restricted-visibility page (event, library item,
 * forum thread, review item) when the viewer can only see it because
 * they're an admin/moderator, not because the owner actually granted them
 * access (host/contributor/author, or invitee) — so they know why they can
 * see something the normal audience rules would otherwise hide from them.
 */
export function RestrictedAccessNotice({ role, ownerName }: { role: string; ownerName: string }) {
  return (
    <div className="mb-6 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
      <Shield className="h-4 w-4 shrink-0" />
      <span>
        You&apos;re viewing this as a {role} — {ownerName} hasn&apos;t granted you access directly.
      </span>
    </div>
  );
}
