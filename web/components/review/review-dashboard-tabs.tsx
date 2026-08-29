"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MySubmissionCard, SharedReviewCard, SeekingReviewersCard } from "@/components/review/review-item-card";
import { CommunityCategoryFilter } from "@/components/shared/community-category-filter";
import type { MyReviewSubmission, SeekingReviewersItem, SharedReviewItem, ReviewCategoryOption } from "@/lib/review";
import { ReviewItemStatus } from "@/lib/generated/prisma/enums";

/** Matches an item if no filter is active, a specific category is picked and the item carries it, or a whole community is picked and the item carries any category under it. */
function matchesCommunityFilter(
  categories: { id: string; communityId: string }[],
  selectedCommunityId: string | null,
  selectedCategoryId: string | null,
): boolean {
  if (selectedCategoryId) return categories.some((c) => c.id === selectedCategoryId);
  if (selectedCommunityId) return categories.some((c) => c.communityId === selectedCommunityId);
  return true;
}

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
  communities,
  categories,
  currentUserId,
}: {
  mySubmissions: MyReviewSubmission[];
  sharedWithMe: SharedReviewItem[];
  seekingReviewers: SeekingReviewersItem[];
  communities: { id: string; name: string }[];
  categories: ReviewCategoryOption[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState("mine");
  // Local state, not URL params — the tabs' own selection isn't URL-driven
  // either (community-based-categorization initiative, objective 4).
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const filteredMySubmissions = mySubmissions.filter((item) =>
    matchesCommunityFilter(item.categories, selectedCommunityId, selectedCategoryId),
  );
  const filteredSharedWithMe = sharedWithMe.filter((item) =>
    matchesCommunityFilter(item.categories, selectedCommunityId, selectedCategoryId),
  );
  const filteredSeekingReviewers = seekingReviewers.filter((item) =>
    matchesCommunityFilter(item.categories, selectedCommunityId, selectedCategoryId),
  );

  const openSubmissionsCount = filteredMySubmissions.filter((item) => item.status === ReviewItemStatus.open).length;
  const sharedWithMeCount = filteredSharedWithMe.length;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="mb-4">
        <CommunityCategoryFilter
          communities={communities}
          categories={categories}
          selectedCommunityId={selectedCommunityId}
          selectedCategoryId={selectedCategoryId}
          onSelectCommunity={(id) => {
            setSelectedCommunityId(id);
            setSelectedCategoryId(null);
          }}
          onSelectCategory={setSelectedCategoryId}
        />
      </div>
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
          ) : filteredMySubmissions.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No submissions match the selected community/category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMySubmissions.map((item) => (
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
          ) : filteredSharedWithMe.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No shared items match the selected community/category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSharedWithMe.map((item) => (
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
          ) : filteredSeekingReviewers.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No open calls match the selected community/category.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSeekingReviewers.map((item) => (
                <SeekingReviewersCard key={item.id} item={item} currentUserId={currentUserId} />
              ))}
            </div>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}
