import Link from "next/link";
import { getUnacknowledgedConductNoticesForUser } from "@/lib/conduct-server";
import { CONDUCT_ACTION_LABELS } from "@/lib/conduct";
import { getPendingPrivacyRequestsForUser } from "@/lib/privacy-server";
import { PRIVACY_REQUEST_TYPE_LABELS } from "@/lib/privacy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Surfaces items that need the member's attention — a privacy request still
 * awaiting admin fulfillment, or an unacknowledged Code of Conduct notice
 * (§4.15) — so they aren't only discoverable by remembering to check
 * Settings. Acknowledging a conduct notice (from Settings' Conduct tab)
 * drops it off this widget; renders nothing when there's nothing to show.
 */
export async function AccountNoticesWidget({ userId }: { userId: string }) {
  const [conductNotices, pendingPrivacyRequests] = await Promise.all([
    getUnacknowledgedConductNoticesForUser(userId),
    getPendingPrivacyRequestsForUser(userId),
  ]);

  if (conductNotices.length === 0 && pendingPrivacyRequests.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="text-lg">Account notices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {pendingPrivacyRequests.map((request) => (
          <Link
            key={request.id}
            href="/settings?tab=privacy"
            className="flex items-center justify-between gap-2 rounded-[10px] border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <span>{PRIVACY_REQUEST_TYPE_LABELS[request.type]} request pending review</span>
            <Badge variant="warning" className="shrink-0">
              Pending
            </Badge>
          </Link>
        ))}
        {conductNotices.map((notice) => (
          <Link
            key={notice.id}
            href="/settings?tab=conduct"
            className="flex items-center justify-between gap-2 rounded-[10px] border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <span className="min-w-0 truncate">Conduct notice: {notice.description}</span>
            <Badge
              variant={notice.actionTaken === "warning" ? "warning" : "danger"}
              className="shrink-0"
            >
              {CONDUCT_ACTION_LABELS[notice.actionTaken!]}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
