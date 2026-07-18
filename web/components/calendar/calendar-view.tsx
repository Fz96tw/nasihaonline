"use client";

import { useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EventListItem } from "@/components/calendar/event-list-item";
import type { MemberEvent } from "@/lib/events";
import "@/components/calendar/calendar-theme.css";

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
  const calendarRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");

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

  function goPrev() {
    calendarRef.current?.getApi().prev();
  }

  function goNext() {
    calendarRef.current?.getApi().next();
  }

  function goToday() {
    calendarRef.current?.getApi().today();
  }

  return (
    <Tabs defaultValue="month">
      <TabsList>
        <TabsTrigger value="month">Month</TabsTrigger>
        <TabsTrigger value="list">Upcoming List</TabsTrigger>
      </TabsList>

      <TabsContent value="month">
        <Card className="hover:translate-y-0 hover:shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{title}</h2>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={goToday}>
                  Today
                </Button>
                <Button variant="outline" size="icon" aria-label="Previous month" onClick={goPrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Next month" onClick={goNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="nasiha-calendar">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin]}
                initialView="dayGridMonth"
                events={fcEvents}
                eventContent={renderEventContent}
                headerToolbar={false}
                datesSet={(arg) => setTitle(arg.view.title)}
                height="auto"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="list">
        <Card className="hover:translate-y-0 hover:shadow-sm">
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
