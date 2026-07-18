import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No messages yet.
                </TableCell>
              </TableRow>
            )}
            {messages.map((message) => (
              <TableRow key={message.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {message.createdAt.toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{message.name}</span>
                    <a
                      href={`mailto:${message.email}`}
                      className="text-xs text-muted-foreground underline underline-offset-2"
                    >
                      {message.email}
                    </a>
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">{message.subject}</TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap text-muted-foreground">
                  {message.message}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
