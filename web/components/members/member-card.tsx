import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT, type DirectoryMember } from "@/lib/members";
import { MemberCardActions } from "@/components/members/member-card-actions";

export function MemberCard({ member }: { member: DirectoryMember }) {
  const name = member.name ?? "Nasiha Member";

  return (
    <Card className="flex flex-col p-6">
      <div className="mb-4 flex items-start gap-4">
        <Avatar name={name} src={member.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">{name}</div>
          {member.titleSpecialty && (
            <div className="truncate text-sm text-muted-foreground">{member.titleSpecialty}</div>
          )}
          {member.countryRegion && (
            <div className="truncate text-xs text-muted-foreground">{member.countryRegion}</div>
          )}
        </div>
      </div>

      {member.tier && (
        <Badge variant={TIER_BADGE_VARIANT[member.tier]} className="mb-3 w-fit">
          {DIRECTORY_TIER_LABELS[member.tier]}
        </Badge>
      )}

      {member.expertiseAreas.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {member.expertiseAreas.map((area) => (
            <Badge key={area} variant="neutral">
              {area}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2">
        <MemberCardActions />
      </div>
    </Card>
  );
}
