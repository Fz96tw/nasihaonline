import { TeamRoleBadge } from "@/lib/generated/prisma/enums";
import type { TeamMemberModel } from "@/lib/generated/prisma/models/TeamMember";
import { getSignedPhotoUrl } from "@/lib/storage";

export const TEAM_ROLE_LABELS: Record<TeamRoleBadge, string> = {
  [TeamRoleBadge.founder]: "Founder",
  [TeamRoleBadge.board_member]: "Board Member",
  [TeamRoleBadge.partner]: "Partner",
};

export const TEAM_ROLE_BADGE_VARIANT: Record<
  TeamRoleBadge,
  "success" | "info" | "warning"
> = {
  [TeamRoleBadge.founder]: "success",
  [TeamRoleBadge.board_member]: "info",
  [TeamRoleBadge.partner]: "warning",
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export type TeamMemberWithPhotoUrl = Omit<TeamMemberModel, "photoUrl"> & {
  photoUrl: string | null;
};

/**
 * TeamMember.photoUrl stores a MinIO object key, not a servable URL — this
 * resolves it to a time-limited signed URL for API responses/rendering.
 */
export async function withSignedPhotoUrl(
  member: TeamMemberModel,
): Promise<TeamMemberWithPhotoUrl> {
  const photoUrl = await getSignedPhotoUrl(member.photoUrl);
  return { ...member, photoUrl };
}

export async function withSignedPhotoUrls(
  members: TeamMemberModel[],
): Promise<TeamMemberWithPhotoUrl[]> {
  return Promise.all(members.map(withSignedPhotoUrl));
}
