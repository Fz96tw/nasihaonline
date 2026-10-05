"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * /library/[id]'s bottom section — tabs the item's Discussion thread and
 * "More by this author" list. Both panels use forceMount (hidden via the
 * inactive data-state, not unmounted) so a reply anchor or search highlight
 * inside Discussion still resolves in the DOM; Discussion is the default tab
 * since arrivals via `?q=` or a reply link target it. The page only renders
 * this when both panels have content — either one alone renders as a plain
 * section with no tab bar.
 */
export function LibraryDetailTabs({
  replyCount,
  authorName,
  discussionContent,
  moreContent,
}: {
  replyCount: number;
  authorName: string;
  discussionContent: ReactNode;
  moreContent: ReactNode;
}) {
  return (
    <Tabs defaultValue="discussion" className="mt-10 border-t pt-8">
      <TabsList>
        <TabsTrigger value="discussion" className="gap-1.5">
          Discussion
          {replyCount > 0 && (
            <Badge variant="neutral" className="px-1.5 py-0">
              {replyCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="more">More by {authorName}</TabsTrigger>
      </TabsList>

      <TabsContent value="discussion" forceMount className="mt-4 data-[state=inactive]:hidden">
        {discussionContent}
      </TabsContent>
      <TabsContent value="more" forceMount className="mt-4 data-[state=inactive]:hidden">
        {moreContent}
      </TabsContent>
    </Tabs>
  );
}
