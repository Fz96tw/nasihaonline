import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdminActionLogForEntities } from "@/lib/audit-server";
import type { AdminActionLogEntryView } from "@/lib/audit";
import type { ContactMessageView } from "@/lib/contact";
import { ContactMessagesTable } from "@/components/admin/contact-messages-table";

export default async function AdminContactMessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const messages = await db.contactMessage.findMany({ orderBy: { createdAt: "desc" } });
  const historyByMessageId = await getAdminActionLogForEntities(
    "ContactMessage",
    messages.map((message) => message.id),
  );

  const messageViews: ContactMessageView[] = messages.map((message) => ({
    id: message.id,
    name: message.name,
    email: message.email,
    services: message.services,
    subject: message.subject,
    message: message.message,
    createdAt: message.createdAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
  }));

  const historyViews: Record<string, AdminActionLogEntryView[]> = {};
  historyByMessageId.forEach((entries, entityId) => {
    historyViews[entityId] = entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt.toISOString(),
      actor: { name: entry.actor.name, email: entry.actor.email },
      metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
    }));
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Contact Messages</h1>
        <p className="text-muted-foreground">
          {messages.length} message{messages.length === 1 ? "" : "s"} submitted via /contact.
          Also sent to info@nasihaforyou.org by email — this list is the fallback record.
        </p>
      </div>

      <ContactMessagesTable initialMessages={messageViews} initialHistory={historyViews} />
    </main>
  );
}
