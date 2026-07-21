import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame, Clock, ListOrdered } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumCategories } from "@/lib/forums-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Forums — NASIHA",
};

type ForumSort = "featured" | "active" | "recent";

const SORT_OPTIONS: { value: ForumSort; label: string; icon: typeof Flame }[] = [
  { value: "featured", label: "Featured order", icon: ListOrdered },
  { value: "active", label: "Most active", icon: Flame },
  { value: "recent", label: "Most recent", icon: Clock },
];

/**
 * /forums (§4.13) — member-only category list, sourced from the six
 * seeded Forum rows. "The primary space for asynchronous, community-wide
 * interaction" per Member_Communications.md. Sort buttons re-order the same
 * fetched list client-side-free via a `?sort=` param — cheap given there
 * are only six categories, no need for a real sort UI.
 */
export default async function ForumsPage({ searchParams }: { searchParams: { sort?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const sort: ForumSort = searchParams.sort === "active" || searchParams.sort === "recent" ? searchParams.sort : "featured";

  const forums = await getForumCategories();
  const sortedForums = [...forums].sort((a, b) => {
    if (sort === "active") return (b.postCount ?? 0) - (a.postCount ?? 0);
    if (sort === "recent") {
      return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
    }
    return 0; // "featured" — keep displayOrder as returned by getForumCategories
  });

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/forums2.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Forums</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            A place to ask questions, share reflections, and connect with the community.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 py-16">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">Sort:</span>
            {SORT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                asChild
                variant={sort === option.value ? "secondary" : "ghost"}
                size="icon"
                className={cn("h-8 w-8", sort === option.value && "border")}
                title={option.label}
              >
                <Link href={option.value === "featured" ? "/forums" : `/forums?sort=${option.value}`} aria-label={option.label}>
                  <option.icon className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sortedForums.map((forum) => (
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
