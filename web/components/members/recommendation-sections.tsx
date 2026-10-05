import { MemberCard } from "@/components/members/member-card";
import { NEW_MEMBER_WINDOW_DAYS, type DirectoryMember, type DirectoryRecommendations } from "@/lib/members";

const BASIS_PREVIEW_COUNT = 3;

/** "A, B and C" — first few names, then "+N more" so the header stays short. */
function listBasis(names: string[]): string {
  const shown = names.slice(0, BASIS_PREVIEW_COUNT);
  const rest = names.length - shown.length;
  const head =
    shown.length <= 1
      ? (shown[0] ?? "")
      : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : head;
}

export type RecommendationKey = "newMembers" | "sharedCommunities" | "sharedInterests";

export const RECOMMENDATION_SECTIONS: {
  key: RecommendationKey;
  /** Short label for the pane's tab. */
  tabLabel: string;
  title: string;
  description: (recommendations: DirectoryRecommendations) => string;
}[] = [
  {
    key: "newMembers",
    tabLabel: "New members",
    title: "New members",
    description: () => `Joined in the last ${NEW_MEMBER_WINDOW_DAYS} days — say hello.`,
  },
  {
    key: "sharedCommunities",
    tabLabel: "Shared communities",
    title: "In your communities",
    description: ({ basis }) => `Because you're in ${listBasis(basis.communities)}. Closest matches first.`,
  },
  {
    key: "sharedInterests",
    tabLabel: "Shared interests",
    title: "Share your interests or expertise",
    description: ({ basis }) =>
      `Based on your interests and expertise: ${listBasis(basis.interests)}. Closest matches first.`,
  },
];

/**
 * One curated list as a Directory pane: why these people are suggested, then
 * their cards. `members` is already narrowed by the search and filters.
 */
export function RecommendationPane({
  sectionKey,
  recommendations,
  members,
  currentUserId,
  emptyHint,
}: {
  sectionKey: RecommendationKey;
  recommendations: DirectoryRecommendations;
  members: DirectoryMember[];
  currentUserId: string;
  emptyHint: string;
}) {
  const section = RECOMMENDATION_SECTIONS.find(({ key }) => key === sectionKey)!;
  return (
    <section aria-labelledby={`recs-${sectionKey}`} className="flex flex-col gap-3">
      <div>
        <h2 id={`recs-${sectionKey}`} className="text-lg font-bold">
          {section.title}
        </h2>
        <p className="text-sm text-muted-foreground">{section.description(recommendations)}</p>
      </div>
      {members.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          {emptyHint}
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </section>
  );
}
