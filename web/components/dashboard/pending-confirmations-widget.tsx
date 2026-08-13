import Link from "next/link";
import { getPendingConfirmationsForCounterpart } from "@/lib/contributions-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Surfaces Knowledge Hours entries naming this member as the counterpart
 * (§4.4 peer confirmation) right on the dashboard — previously only visible
 * by clicking through to /contributions. Applies to every role, including
 * admins: being personally named as counterpart is distinct from the
 * generic "any admin can resolve this" queue admins already see via the
 * header's AdminReviewIcon badge (which this widget never duplicates, since
 * getPendingConfirmationsForCounterpart only returns entries with a named
 * counterpart). Renders nothing when there's nothing pending.
 */
export async function PendingConfirmationsWidget({ userId }: { userId: string }) {
  const entries = await getPendingConfirmationsForCounterpart(userId);
  if (entries.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="text-lg">Knowledge Hours awaiting your confirmation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href="/contributions"
            className="flex items-center justify-between gap-2 rounded-[10px] border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <span className="min-w-0 truncate">
              {entry.actorName} logged {entry.hours} {entry.hours === 1 ? "hour" : "hours"} for {entry.activity}
            </span>
            <Badge variant="warning" className="shrink-0">
              Pending
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
