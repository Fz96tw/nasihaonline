import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { memberLocation } from "@/lib/cities";
import { type DirectoryMember } from "@/lib/members";
import { cn } from "@/lib/utils";
import { OPEN_TO_LABELS } from "@/lib/open-to";
import { FollowMemberButton } from "@/components/members/follow-member-button";

/**
 * Scan-only Directory card: the whole card is one link to the profile, where
 * the labeled Message / Request a 1:1 actions live (MemberCardActions).
 */
export function MemberCard({ member, currentUserId }: { member: DirectoryMember; currentUserId?: string }) {
  const name = member.name ?? "NASIHA Member";
  const showFollow = member.id !== currentUserId;

  const subtitle = [member.titleSpecialty, memberLocation(member)].filter(Boolean).join(" · ");

  return (
    <div className="relative">
    <Link
      href={`/members/${member.id}`}
      aria-label={`View ${name}'s profile`}
      className="block rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className={cn("flex min-w-0 items-center gap-3 p-3", showFollow && "pr-[5.5rem]")}>
        <Avatar name={name} src={member.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{name}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
          {member.openTo.length > 0 && (
            <div className="truncate text-xs font-medium text-primary">
              Open to: {member.openTo.map((tag) => OPEN_TO_LABELS[tag]).join(" · ")}
            </div>
          )}
        </div>
      </Card>
    </Link>
      {showFollow && (
        <FollowMemberButton
          memberId={member.id}
          memberName={name}
          variant="nudge"
          className="absolute right-3 top-1/2 -translate-y-1/2"
        />
      )}
    </div>
  );
}
