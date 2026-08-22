"use client";

import type { ReactNode } from "react";
import { CalendarDays, BookOpen, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="neutral" className="px-1.5 py-0">
      {count}
    </Badge>
  );
}

/** /members/[memberId]'s contributions section (§4.5) — tabs the Events/Library/Forums lists that used to stack as one long list, so a member with a lot of activity in one domain doesn't bury the others. */
export function MemberContributionsTabs({
  eventsCount,
  libraryCount,
  forumCount,
  eventsContent,
  libraryContent,
  forumContent,
}: {
  eventsCount: number;
  libraryCount: number;
  forumCount: number;
  eventsContent: ReactNode;
  libraryContent: ReactNode;
  forumContent: ReactNode;
}) {
  return (
    <Tabs defaultValue="events">
      <TabsList>
        <TabsTrigger value="events" className="gap-1.5">
          <CalendarDays className="h-4 w-4" />
          Events
          <CountBadge count={eventsCount} />
        </TabsTrigger>
        <TabsTrigger value="library" className="gap-1.5">
          <BookOpen className="h-4 w-4" />
          Library
          <CountBadge count={libraryCount} />
        </TabsTrigger>
        <TabsTrigger value="forums" className="gap-1.5">
          <MessageSquare className="h-4 w-4" />
          Forums
          <CountBadge count={forumCount} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="events">{eventsContent}</TabsContent>
      <TabsContent value="library">{libraryContent}</TabsContent>
      <TabsContent value="forums">{forumContent}</TabsContent>
    </Tabs>
  );
}
