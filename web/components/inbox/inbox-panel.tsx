"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { InboxList } from "@/components/inbox/inbox-list";
import { InboxDetail } from "@/components/inbox/inbox-detail";
import { MeetingRequestDetail } from "@/components/inbox/meeting-request-detail";
import { type InboxListItem, type InboxThread } from "@/lib/inbox";
import { cn } from "@/lib/utils";

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
export function InboxPanel({ initialItems }: { initialItems: InboxListItem[] }) {
  const searchParams = useSearchParams();
  // Seeds the selected thread/request from a notification link (`/inbox?item=<id>`, §4.10).
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("item"));
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["inbox-list"],
    queryFn: fetchInboxList,
    initialData: initialItems,
  });

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
    <Card className="flex h-[600px] overflow-hidden p-0">
      <div
        className={cn(
          "w-full flex-shrink-0 flex-col border-r sm:flex sm:w-[320px]",
          selectedId ? "hidden" : "flex",
        )}
      >
        <InboxList items={items} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className={cn("min-w-0 flex-1 flex-col sm:flex", selectedId ? "flex" : "hidden")}>
        {selectedItem?.kind === "meeting_request" ? (
          <MeetingRequestDetail item={selectedItem} onBack={() => setSelectedId(null)} onUpdated={refresh} />
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
  );
}
