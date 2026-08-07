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
  allContent,
  blogContent,
  libraryContent,
  eventsContent,
  forumContent,
}: {
  allCount: number;
  blogCount: number;
  libraryCount: number;
  eventsCount: number;
  forumCount: number;
  allContent: ReactNode;
  blogContent: ReactNode;
  libraryContent: ReactNode;
  eventsContent: ReactNode;
  forumContent: ReactNode;
}) {
  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all" className="gap-1.5">
          All
          <CountBadge count={allCount} />
        </TabsTrigger>
        <TabsTrigger value="blog" className="gap-1.5">
          Blog Posts
          <CountBadge count={blogCount} />
        </TabsTrigger>
        <TabsTrigger value="library" className="gap-1.5">
          Library
          <CountBadge count={libraryCount} />
        </TabsTrigger>
        <TabsTrigger value="events" className="gap-1.5">
          Events
          <CountBadge count={eventsCount} />
        </TabsTrigger>
        <TabsTrigger value="forum" className="gap-1.5">
          Forum Threads
          <CountBadge count={forumCount} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all">{allContent}</TabsContent>
      <TabsContent value="blog">{blogContent}</TabsContent>
      <TabsContent value="library">{libraryContent}</TabsContent>
      <TabsContent value="events">{eventsContent}</TabsContent>
      <TabsContent value="forum">{forumContent}</TabsContent>
    </Tabs>
  );
}
