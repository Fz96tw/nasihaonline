import { Badge } from "@/components/ui/badge";
import { EVENT_TYPE_LABELS, type PublicEvent } from "@/lib/events";

function formatEventDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventListItem({ event }: { event: PublicEvent }) {
  return (
    <li className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={event.open ? "success" : "info"}>
            {event.open ? "Open" : "Members Only"}
          </Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
        </div>
        <p className="truncate font-medium">{event.title}</p>
        {event.hostName ? (
          <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p>
        ) : null}
      </div>
      <p className="whitespace-nowrap text-sm text-muted-foreground">
        {formatEventDateTime(event.startsAt)}
      </p>
    </li>
  );
}
