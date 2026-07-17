"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { TIER_LABELS } from "@/lib/validation/application-review";
import { TIER_BADGE_VARIANT } from "@/lib/members";
import type { getEventEngagementForAdmin } from "@/lib/events-server";

type EventEngagementRow = Awaited<ReturnType<typeof getEventEngagementForAdmin>>[number];

type MemberFilter = "all" | "member" | "non-member";

export function EventEngagementTable({ rows }: { rows: EventEngagementRow[] }) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");

  const events = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.eventId, r.eventTitle);
    return Array.from(seen, ([id, title]) => ({ id, title }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (eventFilter !== "all" && r.eventId !== eventFilter) return false;
      if (memberFilter === "member" && !r.isMember) return false;
      if (memberFilter === "non-member" && r.isMember) return false;
      if (q) {
        const haystack = `${r.name ?? ""} ${r.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, eventFilter, memberFilter, search]);

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
        <Select value={memberFilter} onValueChange={(value) => setMemberFilter(value as MemberFilter)}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by membership">
            <SelectValue placeholder="Everyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="member">Members</SelectItem>
            <SelectItem value="non-member">Non-members</SelectItem>
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
              <TableHead>Member</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground">
                  {row.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell>{row.eventTitle}</TableCell>
                <TableCell>{row.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.email}</TableCell>
                <TableCell>
                  {row.isMember ? (
                    row.tier ? (
                      <Badge variant={TIER_BADGE_VARIANT[row.tier]}>{TIER_LABELS[row.tier]}</Badge>
                    ) : (
                      <Badge variant="neutral">Member</Badge>
                    )
                  ) : (
                    <Badge variant="neutral">Non-member</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
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
