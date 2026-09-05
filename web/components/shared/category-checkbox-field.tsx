"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Community-grouped replacement for the checkbox-list block that used to be
 * duplicated byte-for-byte between SubmitResourceForm and
 * SubmitReviewItemForm (community-based-categorization initiative,
 * objective 3) — collapsible sections keyed by Community instead of one
 * flat ~22+-item list. `communities` controls both grouping and display
 * order (callers pass the result of getAllCommunities, already sorted to
 * COMMUNITY_DISPLAY_ORDER); a community with no matching categories is
 * skipped rather than rendered empty.
 */
export function CategoryCheckboxField({
  categories,
  communities,
  value,
  onChange,
  myCommunityIds = [],
}: {
  categories: { id: string; name: string; communityId: string }[];
  communities: { id: string; name: string }[];
  value: string[];
  onChange: (categoryIds: string[]) => void;
  myCommunityIds?: string[];
}) {
  const categoriesByCommunity = communities
    .map((community) => ({
      community,
      categories: categories.filter((category) => category.communityId === community.id),
    }))
    .filter((group) => group.categories.length > 0);

  // Open every section that already has a checked category (edit mode, or
  // a create-mode resubmit after a validation error) so the member isn't
  // left hunting for where their existing selection lives, plus every
  // section for a community the member has actually joined — so their own
  // communities are visible up front without hiding the rest (callers that
  // don't pass myCommunityIds keep the original checked-only behavior).
  const defaultOpen = categoriesByCommunity
    .filter(
      (group) =>
        group.categories.some((category) => value.includes(category.id)) ||
        myCommunityIds.includes(group.community.id),
    )
    .map((group) => group.community.id);

  function toggle(categoryId: string) {
    onChange(value.includes(categoryId) ? value.filter((id) => id !== categoryId) : [...value, categoryId]);
  }

  return (
    <Accordion type="multiple" defaultValue={defaultOpen} className="rounded-md border">
      {categoriesByCommunity.map(({ community, categories: communityCategories }) => {
        const checkedCount = communityCategories.filter((category) => value.includes(category.id)).length;
        return (
          <AccordionItem key={community.id} value={community.id} className="border-b px-3 last:border-b-0">
            <AccordionTrigger className="py-2.5 text-sm font-medium hover:no-underline">
              {community.name}
              {checkedCount > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">({checkedCount} selected)</span>
              )}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-4">
                {communityCategories.map((category) => (
                  <label key={category.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={value.includes(category.id)} onCheckedChange={() => toggle(category.id)} />
                    {category.name}
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
