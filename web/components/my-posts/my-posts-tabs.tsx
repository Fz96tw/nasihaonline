"use client";

import type { ReactNode } from "react";
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

export function MyPostsTabs({
  allCount,
  blogCount,
  libraryCount,
  eventsCount,
  forumCount,
  meetingsCount,
  allContent,
  blogContent,
  libraryContent,
  eventsContent,
  forumContent,
  meetingsContent,
}: {
  allCount: number;
  blogCount: number;
  libraryCount: number;
  eventsCount: number;
  forumCount: number;
  meetingsCount: number;
  allContent: ReactNode;
  blogContent: ReactNode;
  libraryContent: ReactNode;
  eventsContent: ReactNode;
  forumContent: ReactNode;
  meetingsContent: ReactNode;
}) {
  return (
    <Tabs defaultValue="all">
      <TabsList className="max-w-full justify-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsTrigger value="all" className="shrink-0 gap-1.5">
          All
          <CountBadge count={allCount} />
        </TabsTrigger>
        <TabsTrigger value="blog" className="shrink-0 gap-1.5">
          Blog Posts
          <CountBadge count={blogCount} />
        </TabsTrigger>
        <TabsTrigger value="library" className="shrink-0 gap-1.5">
          Library
          <CountBadge count={libraryCount} />
        </TabsTrigger>
        <TabsTrigger value="events" className="shrink-0 gap-1.5">
          Events
          <CountBadge count={eventsCount} />
        </TabsTrigger>
        <TabsTrigger value="forum" className="shrink-0 gap-1.5">
          Forum Threads
          <CountBadge count={forumCount} />
        </TabsTrigger>
        <TabsTrigger value="meetings" className="shrink-0 gap-1.5">
          Meetings
          <CountBadge count={meetingsCount} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all">{allContent}</TabsContent>
      <TabsContent value="blog">{blogContent}</TabsContent>
      <TabsContent value="library">{libraryContent}</TabsContent>
      <TabsContent value="events">{eventsContent}</TabsContent>
      <TabsContent value="forum">{forumContent}</TabsContent>
      <TabsContent value="meetings">{meetingsContent}</TabsContent>
    </Tabs>
  );
}
