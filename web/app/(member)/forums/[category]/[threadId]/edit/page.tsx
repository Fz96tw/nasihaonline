import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumThreadDetail } from "@/lib/forums-server";
import { EditThreadForm } from "@/components/forums/edit-thread-form";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Edit Thread — NASIHA",
};

// /forums/[category]/[threadId]/edit — thread author or moderator/admin
// only. Same "requester is already authenticated, plain 404 for not
// found/not yours/not editable" rationale as /blog/[slug]/edit.
export default async function EditForumThreadPage({
  params,
}: {
  params: { category: string; threadId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const thread = await getForumThreadDetail(params.category, params.threadId, user.id, isPrivileged);
  if (!thread) notFound();
  if (!thread.isEditable) notFound();

  const isAuthor = user.id === thread.authorId;
  if (!isAuthor && !isPrivileged) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Thread</h1>
        <p className="text-muted-foreground">Update the title and audience below.</p>
      </div>
      <EditThreadForm
        threadId={thread.id}
        forumSlug={thread.forum.slug}
        currentUserId={user.id}
        existingThread={{
          title: thread.title,
          visibility: thread.visibility,
          invitedUserIds: thread.invitees.map((invitee) => invitee.userId),
        }}
      />
    </main>
  );
}
