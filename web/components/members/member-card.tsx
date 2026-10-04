import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { memberLocation } from "@/lib/cities";
import { type DirectoryMember } from "@/lib/members";

/**
 * Scan-only Directory card: the whole card is one link to the profile, where
 * the labeled Message / Request a 1:1 actions live (MemberCardActions).
 */
export function MemberCard({ member }: { member: DirectoryMember }) {
  const name = member.name ?? "NASIHA Member";

  const subtitle = [member.titleSpecialty, memberLocation(member)].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/members/${member.id}`}
      aria-label={`View ${name}'s profile`}
      className="block rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex min-w-0 items-center gap-3 p-3">
        <Avatar name={name} src={member.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{name}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </Card>
    </Link>
  );
}
