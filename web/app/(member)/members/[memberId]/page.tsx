import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryMemberById } from "@/lib/members-server";
import { getMemberForumThreads } from "@/lib/forums-server";
import { getPublishedPostsByAuthor } from "@/lib/blog-server";
import { getEventsHostedByMember } from "@/lib/events-server";
import { getPublishedKnowledgeItemsByContributor } from "@/lib/library-server";
import { MemberProfileView } from "@/components/members/member-profile-view";
import { MemberBlogPosts } from "@/components/members/member-blog-posts";
import { MemberHostedEvents } from "@/components/members/member-hosted-events";
import { MemberLibraryItems } from "@/components/members/member-library-items";
import { MemberForumThreads } from "@/components/members/member-forum-threads";
import { BackLink } from "@/components/back-link";
import { Role } from "@/lib/generated/prisma/enums";

export async function generateMetadata({ params }: { params: { memberId: string } }): Promise<Metadata> {
  const member = await getDirectoryMemberById(params.memberId);
  return { title: member ? `${member.name ?? "Member"} — Directory — NASIHA` : "Member not found — NASIHA" };
}

/**
 * /members/[memberId] (§4.5) — a Directory card's full profile, promoted
 * from the old in-grid dialog to a real, deep-linkable page so there's room
 * below the profile fields for this member's contributions across every
 * content domain (§4.8/§4.9/§4.6/§4.13). Same visibility gate as the rest
 * of the Directory (getDirectoryMemberById 404s a non-listed or Friend-tier
 * id) so this can't be used to route around it.
 */
export default async function MemberProfilePage({ params }: { params: { memberId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const member = await getDirectoryMemberById(params.memberId);
  if (!member) notFound();

  const [posts, events, libraryItems, forumThreads] = await Promise.all([
    getPublishedPostsByAuthor(params.memberId),
    getEventsHostedByMember(params.memberId),
    getPublishedKnowledgeItemsByContributor(params.memberId),
    getMemberForumThreads(params.memberId),
  ]);

  // Every item in libraryItems belongs to this member (params.memberId), so
  // edit eligibility is the same for all of them — either the viewer is this
  // member (self), or a Steward/admin, same gate updateKnowledgeItem enforces.
  const canEditLibraryItems =
    user.id === params.memberId || user.role === Role.moderator || user.role === Role.admin;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <BackLink fallbackHref="/members" />

      <MemberProfileView member={member} currentUserId={user.id} />

      <MemberBlogPosts posts={posts} />
      <MemberHostedEvents events={events} />
      <MemberLibraryItems items={libraryItems} canEdit={canEditLibraryItems} />
      <MemberForumThreads threads={forumThreads} />
    </main>
  );
}
