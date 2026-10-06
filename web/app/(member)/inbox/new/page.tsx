import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryMemberById } from "@/lib/members-server";
import { BackLink } from "@/components/back-link";
import { NewConversationComposer } from "@/components/inbox/new-conversation-composer";

export const metadata: Metadata = {
  title: "New Message",
};

/**
 * /inbox/new — dedicated compose page for a message or 1:1 request.
 * `?to=<memberId>` preselects the recipient (only if they're in the
 * Directory-eligible set, same as the picker); `?mode=meeting` opens on
 * the 1:1 request form instead of the message form.
 */
export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: { to?: string; mode?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const member = searchParams.to && searchParams.to !== user.id ? await getDirectoryMemberById(searchParams.to) : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <BackLink fallbackHref="/inbox" />
      <h1 className="text-2xl font-bold tracking-tight">New message</h1>
      <NewConversationComposer
        currentUserId={user.id}
        initialRecipient={member ? { id: member.id, name: member.name ?? "Unnamed member" } : null}
        initialMode={searchParams.mode === "meeting" ? "meeting" : "message"}
      />
    </main>
  );
}
