"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MySubmissionCard, SharedReviewCard, SeekingReviewersCard } from "@/components/review/review-item-card";
import type { MyReviewSubmission, SeekingReviewersItem, SharedReviewItem } from "@/lib/review";
import { ReviewItemStatus } from "@/lib/generated/prisma/enums";

/**
 * The /review-feedback dashboard's 3 tabs — My Submissions (personal),
 * Shared With Me (personal), Members Seeking Reviewers (community-wide).
 * Styled like GetInvolvedTabs for visual consistency with the rest of the
 * site. Badge counts and the per-card "New" dot (rendered inside the card
 * components) are what let a member glance across a tab without opening
 * every item — see the design doc's UX rationale.
 */
export function ReviewDashboardTabs({
  mySubmissions,
  sharedWithMe,
  seekingReviewers,
  currentUserId,
}: {
  mySubmissions: MyReviewSubmission[];
  sharedWithMe: SharedReviewItem[];
  seekingReviewers: SeekingReviewersItem[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState("mine");

  const openSubmissionsCount = mySubmissions.filter((item) => item.status === ReviewItemStatus.open).length;
  const sharedWithMeCount = sharedWithMe.length;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList
        className="h-auto w-full items-end justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
      >
        <TabsTrigger
          value="mine"
          className="shrink-0 rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-3 text-base font-semibold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-5 sm:text-lg"
        >
          My Submissions{openSubmissionsCount > 0 && <span className="ml-1.5 text-sm text-muted-foreground">{openSubmissionsCount}</span>}
        </TabsTrigger>
        <TabsTrigger
          value="shared"
          className="shrink-0 rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-3 text-base font-semibold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-5 sm:text-lg"
        >
          Shared With Me{sharedWithMeCount > 0 && <span className="ml-1.5 text-sm text-muted-foreground">{sharedWithMeCount}</span>}
        </TabsTrigger>
        <TabsTrigger
          value="seeking"
          className="shrink-0 rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-3 text-base font-semibold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-5 sm:text-lg"
        >
          Members Seeking Reviewers
        </TabsTrigger>
      </TabsList>

      <div className="rounded-b-lg rounded-tr-lg border border-t-0 border-border bg-background p-6">
        <TabsContent value="mine" className="mt-0">
          {mySubmissions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">You haven&apos;t submitted anything for review yet.</p>
              <Button asChild size="sm">
                <Link href="/review-feedback/new">Submit your first item</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {mySubmissions.map((item) => (
                <MySubmissionCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shared" className="mt-0">
          {sharedWithMe.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No one has invited you to review anything yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sharedWithMe.map((item) => (
                <SharedReviewCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="seeking" className="mt-0">
          {seekingReviewers.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No open calls for reviewers right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {seekingReviewers.map((item) => (
                <SeekingReviewersCard key={item.id} item={item} currentUserId={currentUserId} />
              ))}
            </div>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}
