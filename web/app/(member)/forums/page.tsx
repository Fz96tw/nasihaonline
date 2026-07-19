import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumCategories } from "@/lib/forums-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

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
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/forums.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.65)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Forums</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Asynchronous, community-wide discussion across the topics below.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 py-16">
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
      </section>
    </main>
  );
}
