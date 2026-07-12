import "server-only";
import type { TeamMemberModel } from "@/lib/generated/prisma/models/TeamMember";
import { getSignedPhotoUrl } from "@/lib/storage";
import type { TeamMemberWithPhotoUrl } from "@/lib/team";

/**
 * TeamMember.photoUrl stores a MinIO object key, not a servable URL — this
 * resolves it to a time-limited signed URL for API responses/rendering.
 * Kept out of lib/team.ts (which client components import) since this pulls
 * in the Node-only `minio` client via lib/storage.ts.
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
