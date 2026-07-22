import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tier } from "@/lib/generated/prisma/enums";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT, type DirectoryMember } from "@/lib/members";
import { MemberCardActions } from "@/components/members/member-card-actions";

export function MemberCard({
  member,
  currentUserId,
}: {
  member: DirectoryMember;
  currentUserId: string;
}) {
  const name = member.name ?? "NASIHA Member";

  const subtitle = [member.titleSpecialty, member.countryRegion].filter(Boolean).join(" · ");

  return (
    <Card className="flex flex-col gap-2 p-3">
      <Link
        href={`/members/${member.id}`}
        className="flex min-w-0 items-center gap-2.5 text-left"
        aria-label={`View ${name}'s profile`}
      >
        <Avatar name={name} src={member.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold hover:underline">{name}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2">
        {member.tier ? (
          <Badge variant={TIER_BADGE_VARIANT[member.tier]} className="shrink-0">
            {DIRECTORY_TIER_LABELS[member.tier]}
          </Badge>
        ) : (
          <span />
        )}
        <MemberCardActions
          memberId={member.id}
          memberName={name}
          isSelf={member.id === currentUserId}
          isFriendTier={member.tier === Tier.friend}
          showReport={false}
        />
      </div>
    </Card>
  );
}
