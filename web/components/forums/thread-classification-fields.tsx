"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import type { KnowledgeCategoryOption } from "@/lib/library";
import { groupForumsByCommunity, type ForumCategory } from "@/lib/forums";
import { cn } from "@/lib/utils";

/**
 * A thread's classification pickers, shared by NewThreadForm (the /post/new
 * composer) and EditThreadForm: the "Post to"/"Category" chips that choose
 * its forum, and its optional Topics checkboxes.
 */

function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}

/**
 * "Post to" audience chips — Everyone (community-less forums) or a
 * community — then, when that audience has more than one forum, "Category"
 * chips for the forum itself. The audience is derived from the selected
 * forum so the two chip rows can't drift apart.
 */
export function ThreadDestinationPicker({
  forums,
  communities,
  forumId,
  onSelectForum,
}: {
  forums: ForumCategory[];
  communities: { id: string; name: string }[];
  forumId: string;
  onSelectForum: (forumId: string) => void;
}) {
  const selectedForum = forums.find((forum) => forum.id === forumId) ?? forums[0];
  const { general: generalForums, groups: communityForumGroups } = groupForumsByCommunity(forums, communities);
  const audienceId = selectedForum.communityId;
  const forumsFor = (nextAudienceId: string | null) =>
    nextAudienceId === null ? generalForums : (communityForumGroups.find((g) => g.community.id === nextAudienceId)?.forums ?? []);
  const categoryOptions = forumsFor(audienceId);

  function selectAudience(nextAudienceId: string | null) {
    const options = forumsFor(nextAudienceId);
    // Prefer General when switching back to Everyone; otherwise the
    // audience's first forum.
    const next = options.find((forum) => forum.slug === "general") ?? options[0];
    if (next) onSelectForum(next.id);
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Post to</span>
        <div className="flex flex-wrap gap-2">
          {generalForums.length > 0 && (
            <ChoiceChip selected={audienceId === null} onClick={() => selectAudience(null)}>
              Everyone
            </ChoiceChip>
          )}
          {communityForumGroups.map((group) => (
            <ChoiceChip
              key={group.community.id}
              selected={audienceId === group.community.id}
              onClick={() => selectAudience(group.community.id)}
            >
              {group.community.name}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {categoryOptions.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Category</span>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((forum) => (
              <ChoiceChip key={forum.id} selected={forum.id === selectedForum.id} onClick={() => onSelectForum(forum.id)}>
                {forum.name}
              </ChoiceChip>
            ))}
          </div>
          {selectedForum.description && <p className="text-xs text-muted-foreground">{selectedForum.description}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Optional Topics checkboxes. A forum that belongs to a single community
 * scopes straight to that community's categories as a flat list — asking
 * the member to pick a community again (via the Accordion
 * CategoryCheckboxField normally uses) would be redundant. A general forum
 * has no fixed community, so the member first picks which communities
 * they're posting about, then sees only those communities' categories —
 * same two-step shape as SubmitResourceForm/SubmitEventForm. Those
 * community checkboxes aren't a submitted field (the forum, not a community
 * list, is the thread's required classification), so they're local state
 * seeded from initialCommunityIds.
 */
export function ThreadTopicsCheckboxes({
  categories,
  communities,
  forumCommunityId,
  initialCommunityIds,
  value,
  onChange,
}: {
  categories: KnowledgeCategoryOption[];
  communities: { id: string; name: string }[];
  forumCommunityId: string | null;
  initialCommunityIds: string[];
  value: string[];
  onChange: (categoryIds: string[]) => void;
}) {
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>(initialCommunityIds);

  if (forumCommunityId) {
    return (
      <div className="flex flex-wrap gap-4 rounded-md border p-3">
        {categories
          .filter((category) => category.communityId === forumCommunityId)
          .map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.includes(category.id)}
                onCheckedChange={() =>
                  onChange(value.includes(category.id) ? value.filter((id) => id !== category.id) : [...value, category.id])
                }
              />
              {category.name}
            </label>
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 rounded-md border p-3">
        {communities.map((community) => (
          <label key={community.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedCommunityIds.includes(community.id)}
              onCheckedChange={(checked) =>
                setSelectedCommunityIds((prev) =>
                  checked ? [...prev, community.id] : prev.filter((id) => id !== community.id),
                )
              }
            />
            {community.name}
          </label>
        ))}
      </div>
      {selectedCommunityIds.length > 0 && (
        <CategoryCheckboxField
          categories={categories.filter((category) => selectedCommunityIds.includes(category.communityId))}
          communities={communities.filter((community) => selectedCommunityIds.includes(community.id))}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}
