"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { getEventRegistrationsForAdmin } from "@/lib/events-server";

type EventRegistration = Awaited<ReturnType<typeof getEventRegistrationsForAdmin>>[number];

export function EventRegistrationTable({ registrations }: { registrations: EventRegistration[] }) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");

  const events = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of registrations) seen.set(r.eventId, r.event.title);
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [registrations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registrations.filter((r) => {
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (q) {
        const haystack = `${r.name ?? ""} ${r.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [registrations, eventFilter, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
            aria-label="Search registrations"
          />
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="sm:w-64" aria-label="Filter by event">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((registration) => (
              <TableRow key={registration.id}>
                <TableCell className="text-muted-foreground">
                  {registration.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell>{registration.event.title}</TableCell>
                <TableCell>{registration.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{registration.email}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  No registrations match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
