"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ADDED_BY_LINK, queueHref, type QueueParams } from "@/lib/curated-queue-params";

const ALL_SOURCES = "__all";

/** Source filter for the review queue: navigates (back to page 1) when changed. */
export function QueueSourceFilter({ params, sources }: { params: QueueParams; sources: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <Select
      value={params.source ?? ALL_SOURCES}
      onValueChange={(value) => router.push(queueHref(params, { source: value === ALL_SOURCES ? null : value }))}
    >
      <SelectTrigger className="w-full sm:w-64" aria-label="Filter by source">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SOURCES}>All sources</SelectItem>
        <SelectItem value={ADDED_BY_LINK}>Added by link</SelectItem>
        {sources.map((source) => (
          <SelectItem key={source.id} value={source.id}>
            {source.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
