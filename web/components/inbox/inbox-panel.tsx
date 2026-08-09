"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InboxList } from "@/components/inbox/inbox-list";
import { InboxDetail } from "@/components/inbox/inbox-detail";
import { MeetingRequestDetail } from "@/components/inbox/meeting-request-detail";
import { NewConversationActions } from "@/components/inbox/new-conversation-actions";
import { type InboxListItem, type InboxThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";

type InboxFilter = "all" | "unread" | "message" | "meeting_request";

const FILTER_OPTIONS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "message", label: "Messages" },
  { value: "meeting_request", label: "Meeting Requests" },
];

function matchesSearch(item: InboxListItem, query: string): boolean {
  const haystack =
    item.kind === "message"
      ? [item.otherPartyName, item.subject, item.snippet]
      : [item.otherPartyName, item.topic];
  return haystack.some((value) => value?.toLowerCase().includes(query));
}

async function fetchInboxList(): Promise<InboxListItem[]> {
  const response = await fetch("/api/inbox");
  if (!response.ok) throw new Error("Failed to load inbox");
  const data = (await response.json()) as { items: InboxListItem[] };
  return data.items;
}

async function fetchThread(id: string): Promise<InboxThread> {
  const response = await fetch(`/api/inbox/messages/${id}`);
  if (!response.ok) throw new Error("Failed to load message");
  return response.json();
}

/**
 * Single inbox list view with a detail pane (§4.7) — not a 3-column live
 * chat layout. On mobile, selecting a thread swaps the list for the detail
 * pane (driven by `selectedId`, not just a CSS breakpoint); desktop shows
 * both side by side.
 */
export function InboxPanel({
  initialItems,
  currentUserId,
}: {
  initialItems: InboxListItem[];
  currentUserId: string;
}) {
  const searchParams = useSearchParams();
  // Seeds the selected thread/request from a notification link (`/inbox?item=<id>`, §4.10).
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("item"));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["inbox-list"],
    queryFn: fetchInboxList,
    initialData: initialItems,
  });

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "unread" && !(item.kind === "message" && item.unread)) return false;
      if (filter === "message" && item.kind !== "message") return false;
      if (filter === "meeting_request" && item.kind !== "meeting_request") return false;
      if (query && !matchesSearch(item, query)) return false;
      return true;
    });
  }, [items, search, filter]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ["inbox-thread", selectedId],
    queryFn: () => fetchThread(selectedId as string),
    enabled: selectedItem?.kind === "message",
  });

  // GET /api/inbox/messages/:id marks the viewer's unread messages in that
  // thread as read as a side effect — refresh the list so its unread state
  // (dot/bold) reflects that without a second explicit "mark read" call.
  useEffect(() => {
    if (thread) queryClient.invalidateQueries({ queryKey: ["inbox-list"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, thread?.messages.length]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inbox-list"] }),
      selectedId ? queryClient.invalidateQueries({ queryKey: ["inbox-thread", selectedId] }) : Promise.resolve(),
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <NewConversationActions
          currentUserId={currentUserId}
          items={items}
          onSelectExisting={setSelectedId}
        />
      </div>
      <Card className="flex h-[600px] overflow-hidden p-0">
        <div
          className={cn(
            "w-full flex-shrink-0 flex-col border-r sm:flex sm:w-[320px]",
            selectedId ? "hidden" : "flex",
          )}
        >
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search messages…"
                className="pl-9"
                aria-label="Search the inbox"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === option.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <InboxList
              items={filteredItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              hasUnfilteredItems={items.length > 0}
            />
          </div>
        </div>
        <div className={cn("min-w-0 flex-1 flex-col sm:flex", selectedId ? "flex" : "hidden")}>
          {selectedItem?.kind === "meeting_request" ? (
            <MeetingRequestDetail
              item={selectedItem}
              currentUserId={currentUserId}
              onBack={() => setSelectedId(null)}
              onUpdated={refresh}
            />
          ) : (
            <InboxDetail
              thread={thread}
              isLoading={threadLoading}
              onBack={() => setSelectedId(null)}
              onReplySent={refresh}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
