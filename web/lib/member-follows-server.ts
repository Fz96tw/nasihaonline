import "server-only";
import { db } from "@/lib/db";
import { getDirectoryMemberById, getDirectoryMembersByIds } from "@/lib/members-server";
import type { DirectoryMember } from "@/lib/members";
import { getProfileAvatarUrl } from "@/lib/storage";

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

const FOLLOWING_FEED_AUTHOR_LIMIT = 50;

/**
 * The members whose items feed What's New's "Following" pane: the viewer's
 * most recently followed, capped so one heavy follower can't turn the feed
 * query into an unbounded IN list. Only ever called with the viewer's own id.
 */
export async function getFollowingFeedAuthorIds(followerId: string): Promise<string[]> {
  const rows = await db.memberFollow.findMany({
    where: { followerId },
    orderBy: { createdAt: "desc" },
    take: FOLLOWING_FEED_AUTHOR_LIMIT,
    select: { followedId: true },
  });
  return rows.map((row) => row.followedId);
}

export type FollowingChip = { id: string; name: string; avatarUrl: string | null };

/**
 * Chips for What's New's Following pane: the members behind
 * `getFollowingFeedAuthorIds`, ordered by who surfaced first in `activityOrder`
 * (author ids as they appear in the pane's newest-first first page), then the
 * rest by most recently followed. Suspended members are left out.
 */
export async function getFollowingChips(
  authorIds: string[],
  activityOrder: (string | null)[],
): Promise<FollowingChip[]> {
  if (authorIds.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: authorIds }, suspended: false },
    select: { id: true, name: true, profile: { select: { avatarUrl: true } } },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  const ordered: string[] = [];
  for (const id of [...activityOrder, ...authorIds]) {
    if (id && byId.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered.map((id) => {
    const user = byId.get(id)!;
    return { id, name: user.name ?? "NASIHA Member", avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null) };
  });
}
