import { ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tier } from "@/lib/generated/prisma/enums";
import { INTEREST_AREA_LABELS } from "@/lib/interest-areas";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT, type DirectoryMember } from "@/lib/members";
import { MemberCardActions } from "@/components/members/member-card-actions";
import { AVAILABILITY_LABELS } from "@/lib/validation/application";

/**
 * /members/[memberId] (§4.5) — the full profile section of the page, same
 * fields as the old in-grid MemberProfileDialog plus the Message/Request
 * Meeting/Report actions that used to live only on the Directory card.
 */
export function MemberProfileView({
  member,
  currentUserId,
}: {
  member: DirectoryMember;
  currentUserId: string;
}) {
  const name = member.name ?? "NASIHA Member";

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar name={name} src={member.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-xl font-bold">{name}</h1>
            {member.titleSpecialty && (
              <div className="text-sm text-muted-foreground">{member.titleSpecialty}</div>
            )}
            {member.countryRegion && (
              <div className="text-xs text-muted-foreground">{member.countryRegion}</div>
            )}
            {member.linkedinUrl && (
              <a
                href={member.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                LinkedIn <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <MemberCardActions
          memberId={member.id}
          memberName={name}
          isSelf={member.id === currentUserId}
          isFriendTier={member.tier === Tier.friend}
        />
      </div>

      {member.tier && (
        <Badge variant={TIER_BADGE_VARIANT[member.tier]} className="w-fit">
          {DIRECTORY_TIER_LABELS[member.tier]}
        </Badge>
      )}

      {member.careerStage && (
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">Career Stage</div>
          <p className="text-sm">{member.careerStage}</p>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground">Bio</div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {member.bio || "This member hasn't added a bio yet."}
        </p>
      </div>

      {(member.skills.length > 0 || member.expertiseAreas.length > 0) && (
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Areas of Expertise
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {member.skills.map((skill) => (
              <Badge key={skill.id} variant="neutral">
                {skill.name}
              </Badge>
            ))}
            {member.expertiseAreas.map((area) => (
              <Badge key={area} variant="neutral">
                {area}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {member.learningTopics && (
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Topics They Want to Learn
          </div>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {member.learningTopics}
          </p>
        </div>
      )}

      {member.interestAreas.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Interest Areas
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {member.interestAreas.map((area) => (
              <Badge key={area} variant="neutral">
                {INTEREST_AREA_LABELS[area]}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {member.availability.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Availability
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {member.availability.map((value) => (
              <Badge key={value} variant="neutral">
                {AVAILABILITY_LABELS[value]}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
