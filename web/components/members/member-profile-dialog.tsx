"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT, type DirectoryMember } from "@/lib/members";

/**
 * Full-detail view of a Directory card (§4.5) — the one field the card
 * itself omits for space, bio, lives here so a member who wants to "learn
 * more about the person" has somewhere to see it in full.
 */
export function MemberProfileDialog({
  member,
  open,
  onOpenChange,
}: {
  member: DirectoryMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const name = member.name ?? "NASIHA Member";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar name={name} src={member.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1 pt-1">
              <DialogTitle>{name}</DialogTitle>
              {member.titleSpecialty && (
                <div className="truncate text-sm text-muted-foreground">{member.titleSpecialty}</div>
              )}
              {member.countryRegion && (
                <div className="truncate text-xs text-muted-foreground">{member.countryRegion}</div>
              )}
            </div>
          </div>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
