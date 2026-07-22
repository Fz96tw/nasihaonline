import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { DirectoryMember } from "@/lib/members";

/** Author byline on /blog/[slug] (§4.8) — clickable through to the author's Directory profile page when they're directory-listed, plain avatar+name otherwise. */
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
    <Link
      href={`/members/${authorProfile.id}`}
      aria-label={`View ${name}'s profile`}
      className="flex items-center gap-3 text-left"
    >
      <Avatar name={name} src={avatarUrl} size="sm" />
      <div className="text-sm text-muted-foreground">
        <div className="font-medium text-foreground">{name}</div>
        <div>{dateLabel}</div>
      </div>
    </Link>
  );
}
