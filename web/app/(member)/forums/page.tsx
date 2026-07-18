import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumCategories } from "@/lib/forums-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Forums — NASIHA",
};

/**
 * /forums (§4.13) — member-only category list, sourced from the six
 * seeded Forum rows. "The primary space for asynchronous, community-wide
 * interaction" per Member_Communications.md.
 */
export default async function ForumsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const forums = await getForumCategories();

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Forums</h1>
        <p className="text-muted-foreground">
          Asynchronous, community-wide discussion across the topics below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {forums.map((forum) => (
          <Link key={forum.id} href={`/forums/${forum.slug}`}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg">{forum.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {forum.description && <p className="text-sm text-muted-foreground">{forum.description}</p>}
                <Badge variant="neutral" className="w-fit">
                  {forum.threadCount} {forum.threadCount === 1 ? "thread" : "threads"}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
