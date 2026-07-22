import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_TYPE_LABELS, type MemberHostedEvent } from "@/lib/events";

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** /members/[memberId]'s Events section (§4.5/§4.6) — events this member has hosted, newest first. Divided list, same convention as CalendarView's Upcoming List tab, not one card per event. */
export function MemberHostedEvents({ events }: { events: MemberHostedEvent[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CalendarDays className="h-4 w-4" />
        Events
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">This member hasn&apos;t hosted any events yet.</p>
      ) : (
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardContent className="pt-6">
            <ul>
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {event.heroImageUrl && (
                      <Link
                        href={`/calendar/${event.id}`}
                        className="block h-14 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
                        <img src={event.heroImageUrl} alt="" className="h-full w-full object-cover" />
                      </Link>
                    )}
                    <Link href={`/calendar/${event.id}`} className="min-w-0 truncate font-medium hover:underline">
                      {event.title}
                    </Link>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
                    <span>{formatEventDate(event.startsAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
