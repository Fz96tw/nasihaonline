"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT, type DirectoryMember } from "@/lib/members";
import { MemberCardActions } from "@/components/members/member-card-actions";
import { MemberProfileDialog } from "@/components/members/member-profile-dialog";

export function MemberCard({ member, currentUserId }: { member: DirectoryMember; currentUserId: string }) {
  const name = member.name ?? "Nasiha Member";
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <Card className="flex flex-col p-4">
      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        className="mb-3 flex items-start gap-3 text-left"
        aria-label={`View ${name}'s profile`}
      >
        <Avatar name={name} src={member.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold hover:underline">{name}</div>
          {member.titleSpecialty && (
            <div className="truncate text-xs text-muted-foreground">{member.titleSpecialty}</div>
          )}
          {member.countryRegion && (
            <div className="truncate text-xs text-muted-foreground">{member.countryRegion}</div>
          )}
        </div>
      </button>
      <MemberProfileDialog member={member} open={profileOpen} onOpenChange={setProfileOpen} />

      {member.tier && (
        <Badge variant={TIER_BADGE_VARIANT[member.tier]} className="mb-3 w-fit">
          {DIRECTORY_TIER_LABELS[member.tier]}
        </Badge>
      )}

      <div className="mt-auto pt-2">
        <MemberCardActions memberId={member.id} memberName={name} isSelf={member.id === currentUserId} />
      </div>
    </Card>
  );
}
