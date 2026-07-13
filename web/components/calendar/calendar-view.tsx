"use client";

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventListItem } from "@/components/calendar/event-list-item";
import type { MemberEvent } from "@/lib/events";

type RsvpState = { rsvped: boolean; meetingUrl: string | null };

function toFullCalendarEvents(events: MemberEvent[]): EventInput[] {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.startsAt,
    end: event.endsAt ?? undefined,
    extendedProps: { open: event.open },
  }));
}

// Custom render instead of FullCalendar's default event pill so open vs.
// members-only events (the whole point of this view over the public one)
// stay visually distinguishable at month-grid scale.
function renderEventContent(arg: EventContentArg) {
  const open = arg.event.extendedProps.open as boolean;
  return (
    <div className="flex items-center gap-1 overflow-hidden px-1">
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${open ? "bg-emerald-500" : "bg-blue-500"}`}
      />
      <span className="truncate text-xs">{arg.event.title}</span>
    </div>
  );
}

export function CalendarView({ events }: { events: MemberEvent[] }) {
  // Radix's TabsContent unmounts the inactive panel by default, so RSVP
  // state can't live in EventListItem's own useState — switching to Month
  // and back would remount it from the original (now-stale) `events` prop
  // and the toggle would appear to "forget" itself. Keeping it here instead
  // means it survives regardless of which tab is mounted.
  const [rsvpState, setRsvpState] = useState<Record<string, RsvpState>>({});

  const resolvedEvents = useMemo(
    () => events.map((event) => ({ ...event, ...rsvpState[event.id] })),
    [events, rsvpState],
  );

  const fcEvents = useMemo(() => toFullCalendarEvents(resolvedEvents), [resolvedEvents]);
  const upcoming = useMemo(
    () => [...resolvedEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [resolvedEvents],
  );

  function handleRsvpToggled(eventId: string, result: RsvpState) {
    setRsvpState((prev) => ({ ...prev, [eventId]: result }));
  }

  return (
    <Tabs defaultValue="month">
      <TabsList>
        <TabsTrigger value="month">Month</TabsTrigger>
        <TabsTrigger value="list">Upcoming List</TabsTrigger>
      </TabsList>

      <TabsContent value="month">
        <Card>
          <CardContent className="pt-6">
            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              events={fcEvents}
              eventContent={renderEventContent}
              headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
              height="auto"
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="list">
        <Card>
          <CardContent className="pt-6">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming events right now — check back soon.
              </p>
            ) : (
              <ul>
                {upcoming.map((event) => (
                  <EventListItem
                    key={event.id}
                    event={event}
                    onRsvpToggled={(result) => handleRsvpToggled(event.id, result)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
