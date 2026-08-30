"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDurationMinutes } from "@/lib/format-date";
import { getCsrfToken } from "@/lib/csrf-client";

// Mirrors lib/quick-recordings-server.ts's QuickRecordingListItem — kept as
// a separate client-side type rather than importing it (a "server-only"
// module), same convention meeting-waiting-room.tsx's MeetingWaitingRoomStatus
// follows for the same reason.
export type QuickRecordingListItem = {
  id: string;
  meetingRequestId: string;
  topic: string;
  createdAt: string;
  durationSeconds: number | null;
  ready: boolean;
  failed: boolean;
  shared: { label: string; href: string } | null;
};

/** Same "Mon D, h:mm AM/PM" shape as lib/format-date.ts's formatTimestamp — duplicated as a plain function (not imported) since that one isn't hydration-safe here: this component fetches its list client-side only, after mount, so there's no SSR/client mismatch to guard against. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

/**
 * Shared building block (video-library objective) for inserting a
 * *previously* recorded quick video, consumed by the forum/inbox/review
 * sharing composers (their own separate objectives — not wired up yet).
 * Same Command/Popover combobox shape as components/tag-picker.tsx, but
 * single-select (no removable-badge multi-select) and fetches its own
 * options on open rather than taking them as a prop, since the list is
 * per-viewer and changes over time (new recordings, renames, deletions).
 *
 * "Record a new video instead" always starts a *fresh* quick recording
 * (same one-click flow as QuickRecordingButton) rather than letting the
 * caller somehow resume/select mid-creation — inserting a video a composer
 * is currently drafting has to wait until that new recording is actually
 * done, which is why this navigates away rather than resolving a callback.
 * Set `allowRecordNew={false}` in a context with a live draft (e.g. a forum
 * post/reply body) to hide that option — navigating away would silently
 * lose whatever the member had typed, with no way back into the same
 * compose session once the new recording finishes.
 */
export function QuickRecordingPicker({
  onSelect,
  triggerLabel = "Insert a video…",
  allowRecordNew = true,
}: {
  onSelect: (recording: QuickRecordingListItem) => void;
  triggerLabel?: string;
  allowRecordNew?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recordings, setRecordings] = useState<QuickRecordingListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingNew, setStartingNew] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/quick-recordings")
      .then((res) => (res.ok ? res.json() : { recordings: [] }))
      .then((data) => {
        if (!cancelled) setRecordings(Array.isArray(data?.recordings) ? data.recordings : []);
      })
      .catch(() => {
        if (!cancelled) setRecordings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function recordNewInstead() {
    setStartingNew(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/quick-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Couldn't start a quick recording.");
      const data: { id: string } = await res.json();
      router.push(`/meet/quick/${data.id}`);
    } catch {
      setStartingNew(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            {triggerLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandList>
            {allowRecordNew && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="record-a-new-video-instead"
                    disabled={startingNew}
                    onSelect={recordNewInstead}
                    className="font-medium text-primary"
                  >
                    <Video className="h-4 w-4" />
                    {startingNew ? "Starting…" : "Record a new video instead"}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="Past recordings">
              {loading ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <CommandEmpty>No past recordings yet.</CommandEmpty>
              )}
              {recordings.map((recording) => (
                <CommandItem
                  key={recording.id}
                  value={`${recording.topic} ${recording.id}`}
                  onSelect={() => {
                    onSelect(recording);
                    setOpen(false);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{recording.topic}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(recording.createdAt)}
                      {recording.durationSeconds != null && ` · ${formatDurationMinutes(recording.durationSeconds)}`}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
