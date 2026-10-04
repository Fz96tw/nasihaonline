import { MemberCard } from "@/components/members/member-card";
import { NEW_MEMBER_WINDOW_DAYS, type DirectoryRecommendations } from "@/lib/members";

const SECTIONS: {
  key: keyof DirectoryRecommendations;
  title: string;
  description: string;
}[] = [
  { key: "newMembers", title: "New members", description: `Joined in the last ${NEW_MEMBER_WINDOW_DAYS} days — say hello.` },
  { key: "sharedCommunities", title: "In your communities", description: "Members who follow the same communities as you." },
  { key: "sharedInterests", title: "Share your interests", description: "Members with interests or expertise that overlap yours." },
];

/**
 * Curated lists above the Directory grid. A section with no members is not
 * rendered at all (no empty headings), and the whole block renders nothing
 * when every list is empty.
 */
export function RecommendationSections({ recommendations }: { recommendations: DirectoryRecommendations }) {
  const visible = SECTIONS.filter(({ key }) => recommendations[key].length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {visible.map(({ key, title, description }) => (
        <section key={key} aria-labelledby={`recs-${key}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`recs-${key}`} className="text-lg font-bold">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recommendations[key].map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
