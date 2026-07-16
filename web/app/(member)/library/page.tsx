import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getKnowledgeCategories, getPublishedKnowledgeItems } from "@/lib/library-server";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/library";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Knowledge Library — NASIHA",
};

function CategoryChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </Link>
  );
}

const selectClasses =
  "h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * /library (§4.9/§5) — member-only browse/search landing. `q` routes
 * through Meilisearch (§7.2/§9), category/type/level filter plain Postgres
 * — same "real query goes to Meilisearch, browse stays on Postgres" split
 * as /blog. Only published/flagged items ever appear (getPublishedKnowledgeItems
 * enforces this server-side).
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { category?: string; type?: string; level?: string; q?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const contentType = Object.values(KnowledgeContentType).includes(searchParams.type as KnowledgeContentType)
    ? (searchParams.type as KnowledgeContentType)
    : undefined;
  const level = Object.values(KnowledgeLevel).includes(searchParams.level as KnowledgeLevel)
    ? (searchParams.level as KnowledgeLevel)
    : undefined;

  const [items, categories] = await Promise.all([
    getPublishedKnowledgeItems({ categorySlug: searchParams.category, contentType, level, q: searchParams.q }),
    getKnowledgeCategories(),
  ]);

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Library</h1>
          <p className="text-muted-foreground">
            Recorded lectures, articles, case studies, and guidelines shared by members.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/library/mine">My Submissions</Link>
          </Button>
          <Button asChild>
            <Link href="/library/new">Submit Resource</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CategoryChip href="/library" active={!searchParams.category}>
          All specialties
        </CategoryChip>
        {categories.map((category) => (
          <CategoryChip
            key={category.id}
            href={`/library?category=${category.slug}`}
            active={searchParams.category === category.slug}
          >
            {category.name}
          </CategoryChip>
        ))}
      </div>

      <form action="/library" method="get" className="flex flex-wrap items-end gap-3">
        {searchParams.category && <input type="hidden" name="category" value={searchParams.category} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className="text-sm font-medium">
            Content type
          </label>
          <select id="type" name="type" defaultValue={searchParams.type ?? ""} className={selectClasses}>
            <option value="">All types</option>
            {Object.values(KnowledgeContentType).map((value) => (
              <option key={value} value={value}>
                {CONTENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="level" className="text-sm font-medium">
            Career-stage level
          </label>
          <select id="level" name="level" defaultValue={searchParams.level ?? ""} className={selectClasses}>
            <option value="">All levels</option>
            {Object.values(KnowledgeLevel).map((value) => (
              <option key={value} value={value}>
                {LEVEL_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 gap-2">
          <Input type="search" name="q" defaultValue={searchParams.q} placeholder="Search resources…" className="max-w-sm" />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="rounded-[10px] border p-8 text-center text-muted-foreground">
          {searchParams.q || searchParams.category || contentType || level
            ? "No resources match your filters."
            : "No resources have been published yet — check back soon."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <LibraryItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
