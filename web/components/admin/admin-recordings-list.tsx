"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordingRow } from "@/components/calendar/recording-row";
import type { AdminRecordingGroup } from "@/lib/admin-recordings-server";

function formatOccurredAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** No delete action on this oversight page (deleteUrl is always null), so RecordingRow's onDeleted never actually fires — it just needs a function reference, which a Server Component can't pass as a prop. */
function noop() {}

export function AdminRecordingsList({ groups }: { groups: AdminRecordingGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No LiveKit recordings yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.key} className="hover:translate-y-0 hover:shadow-sm">
          <CardHeader className="space-y-1 pb-3">
            <Badge variant={group.kind === "event" ? "info" : "neutral"} className="w-fit">
              {group.kind === "event" ? "Event" : "1:1 Meeting"}
            </Badge>
            <CardTitle className="text-lg">{group.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {group.organizerName}
              {group.occurredAt ? ` · ${formatOccurredAt(group.occurredAt)}` : ""}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {group.segments.map((segment) => (
              <RecordingRow
                key={segment.id}
                label={segment.label}
                meta={segment.meta}
                status={segment.status}
                watchHref={segment.watchHref}
                downloadHref={segment.downloadHref}
                copyUrl={segment.watchHref}
                copyLabel="Copy link"
                deleteUrl={null}
                onDeleted={noop}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
