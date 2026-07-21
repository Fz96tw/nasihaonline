"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import type { EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EventListItem } from "@/components/calendar/event-list-item";
import type { MemberEvent } from "@/lib/events";
import "@/components/calendar/calendar-theme.css";

type RsvpState = { rsvped: boolean; meetingUrl: string | null; attendeeCount?: number };

// Remembers the last tab the member picked so it survives navigating away
// from /calendar and back (Tabs' own defaultValue only survives re-renders,
// not a full remount). The ?ref=feed forced-to-"list" case below is a
// one-time referral override, not a preference, so it's deliberately never
// written back here.
const CALENDAR_TAB_STORAGE_KEY = "nasiha:calendar-tab";

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

export function CalendarView({
  events,
  forcedTab,
}: {
  events: MemberEvent[];
  /** Referral-driven override (e.g. arriving via ?ref=feed) — wins over any remembered tab, but isn't itself remembered. */
  forcedTab?: "month" | "list";
}) {
  // Radix's TabsContent unmounts the inactive panel by default, so RSVP
  // state can't live in EventListItem's own useState — switching to Month
  // and back would remount it from the original (now-stale) `events` prop
  // and the toggle would appear to "forget" itself. Keeping it here instead
  // means it survives regardless of which tab is mounted.
  const [rsvpState, setRsvpState] = useState<Record<string, RsvpState>>({});
  const calendarRef = useRef<FullCalendar>(null);
  const [title, setTitle] = useState("");
  const router = useRouter();
  const [tab, setTab] = useState<"month" | "list">(forcedTab ?? "month");

  useEffect(() => {
    if (forcedTab) return;
    const stored = window.localStorage.getItem(CALENDAR_TAB_STORAGE_KEY);
    if (stored === "month" || stored === "list") setTab(stored);
  }, [forcedTab]);

  function handleTabChange(value: string) {
    setTab(value as "month" | "list");
    window.localStorage.setItem(CALENDAR_TAB_STORAGE_KEY, value);
  }

  const resolvedEvents = useMemo(
    () => events.map((event) => ({ ...event, ...rsvpState[event.id] })),
    [events, rsvpState],
  );

  const fcEvents = useMemo(() => toFullCalendarEvents(resolvedEvents), [resolvedEvents]);
  // Month grid shows every event (including past ones, so browsing to an
  // earlier month isn't empty); this tab is explicitly "Upcoming List", so
  // it filters startsAt back down to future-only itself.
  const upcoming = useMemo(
    () =>
      resolvedEvents
        .filter((event) => event.startsAt >= new Date().toISOString())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
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

  function handleEventClick(arg: EventClickArg) {
    arg.jsEvent.preventDefault();
    router.push(`/calendar/${arg.event.id}`);
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
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
                eventClick={handleEventClick}
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
