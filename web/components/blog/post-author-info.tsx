"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { MemberProfileDialog } from "@/components/members/member-profile-dialog";
import type { DirectoryMember } from "@/lib/members";

/** Author byline on /blog/[slug] (§4.8) — clickable through to the Directory profile dialog when the author is directory-listed, plain avatar+name otherwise. */
export function PostAuthorInfo({
  name,
  avatarUrl,
  dateLabel,
  authorProfile,
}: {
  name: string;
  avatarUrl: string | null;
  dateLabel: string;
  authorProfile: DirectoryMember | null;
}) {
  const [open, setOpen] = useState(false);

  if (!authorProfile) {
    return (
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatarUrl} size="sm" />
        <div className="text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{name}</div>
          <div>{dateLabel}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${name}'s profile`}
        className="flex items-center gap-3 text-left"
      >
        <Avatar name={name} src={avatarUrl} size="sm" />
        <div className="text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{name}</div>
          <div>{dateLabel}</div>
        </div>
      </button>
      <MemberProfileDialog member={authorProfile} open={open} onOpenChange={setOpen} />
    </>
  );
}
