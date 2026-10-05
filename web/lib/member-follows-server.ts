import "server-only";
import { db } from "@/lib/db";
import { getDirectoryMemberById, getDirectoryMembersByIds } from "@/lib/members-server";
import type { DirectoryMember } from "@/lib/members";

export class MemberFollowError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Idempotent follow/unfollow of a member into the viewer's private "My
 * people" list. The target must pass the Directory visibility gate (an
 * unlisted member can't be saved, same as they can't be messaged), and
 * nobody can follow themselves. Unfollowing is always allowed, even if the
 * member has since been unlisted, so a stale entry can be removed.
 */
export async function setMemberFollow(followerId: string, followedId: string, following: boolean): Promise<void> {
  if (!following) {
    await db.memberFollow.deleteMany({ where: { followerId, followedId } });
    return;
  }

  if (followerId === followedId) throw new MemberFollowError("You can't follow yourself.", 400);
  if (!(await getDirectoryMemberById(followedId))) throw new MemberFollowError("Member not found.", 404);

  await db.memberFollow.upsert({
    where: { followerId_followedId: { followerId, followedId } },
    create: { followerId, followedId },
    update: {},
  });
}

/** Ids the viewer follows — only ever called with the viewer's own id. */
export async function getFollowedMemberIds(followerId: string): Promise<string[]> {
  const rows = await db.memberFollow.findMany({ where: { followerId }, select: { followedId: true } });
  return rows.map((row) => row.followedId);
}

/**
 * The viewer's "My people" list, newest-followed first. Re-applies the
 * Directory gate, so members who've since unlisted or been suspended drop
 * out of the list (the rows stay, and reappear if they relist).
 */
export async function getMyPeople(followerId: string): Promise<DirectoryMember[]> {
  const rows = await db.memberFollow.findMany({
    where: { followerId },
    orderBy: { createdAt: "desc" },
    select: { followedId: true },
  });
  const members = await getDirectoryMembersByIds(rows.map((row) => row.followedId));
  return rows.flatMap((row) => {
    const member = members.get(row.followedId);
    return member ? [member] : [];
  });
}
