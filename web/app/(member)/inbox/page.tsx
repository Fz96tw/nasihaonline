import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getInboxList } from "@/lib/inbox-server";
import { InboxPanel } from "@/components/inbox/inbox-panel";

export const metadata: Metadata = {
  title: "Inbox — Nasiha",
};

export default async function InboxPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const items = await getInboxList(user.id);

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground">
          Asynchronous messages and meeting requests from fellow members — no live chat.
        </p>
      </div>

      <Suspense fallback={null}>
        <InboxPanel initialItems={items} />
      </Suspense>
    </main>
  );
}
