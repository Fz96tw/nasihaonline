"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format-date";
import type { SurveyRecipientRow } from "@/lib/surveys-server";

const SOURCE_LABELS: Record<string, string> = {
  member: "Member",
  donor: "Donor",
  event_registrant: "Event Registrant",
};

type SourceFilter = "all" | "member" | "donor" | "event_registrant";
type RespondedFilter = "all" | "responded" | "pending";

/**
 * Delivery/response status report — who a survey was sent to and whether
 * they've responded yet, so admin can see who to follow up with. Client-
 * side filtering only, same convention as UserTable/EventEngagementTable
 * since this data is expected to stay small.
 */
export function SurveyRecipientTable({ recipients }: { recipients: SurveyRecipientRow[] }) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [respondedFilter, setRespondedFilter] = useState<RespondedFilter>("all");

  const filtered = useMemo(() => {
    return recipients.filter((recipient) => {
      if (sourceFilter !== "all" && recipient.source !== sourceFilter) return false;
      if (respondedFilter === "responded" && !recipient.respondedAt) return false;
      if (respondedFilter === "pending" && recipient.respondedAt) return false;
      return true;
    });
  }, [recipients, sourceFilter, respondedFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="member">Members</SelectItem>
            <SelectItem value="donor">Donors</SelectItem>
            <SelectItem value="event_registrant">Event Registrants</SelectItem>
          </SelectContent>
        </Select>
        <Select value={respondedFilter} onValueChange={(value) => setRespondedFilter(value as RespondedFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Responded + Pending</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No recipients match this filter.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((recipient) => (
              <TableRow key={recipient.id}>
                <TableCell>{recipient.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{recipient.email}</TableCell>
                <TableCell>
                  <Badge variant="neutral">{SOURCE_LABELS[recipient.source] ?? recipient.source}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {recipient.sentAt ? formatTimestamp(recipient.sentAt) : "—"}
                </TableCell>
                <TableCell>
                  {recipient.respondedAt ? (
                    <Badge variant="success">Responded {formatTimestamp(recipient.respondedAt)}</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
