import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { TEAM_ROLE_LABELS, TEAM_ROLE_BADGE_VARIANT } from "@/lib/team";
import type { TeamMemberWithPhotoUrl } from "@/lib/team";

export function TeamMemberCard({ member }: { member: TeamMemberWithPhotoUrl }) {
  return (
    <Card className="flex flex-col items-center p-6 text-center">
      <Avatar name={member.name} src={member.photoUrl} size="xl" className="mb-4" />
      <div className="mb-1 text-base font-bold">{member.name}</div>
      <Badge variant={TEAM_ROLE_BADGE_VARIANT[member.roleBadge]} className="mb-2">
        {TEAM_ROLE_LABELS[member.roleBadge]}
      </Badge>
      <div className="mb-3 text-sm text-muted-foreground">{member.title}</div>
      <CardContent className="p-0 text-sm leading-relaxed text-muted-foreground">
        {member.bio}
      </CardContent>
    </Card>
  );
}
