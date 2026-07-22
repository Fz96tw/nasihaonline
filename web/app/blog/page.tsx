import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { Clock, Eye, MessageSquare } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getPostCategories, getPublishedPosts } from "@/lib/blog-server";
import type { PostSort } from "@/lib/blog";
import { PostCard } from "@/components/blog/post-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";
import { SortButton } from "@/components/forums/sort-button";

export const metadata: Metadata = {
  title: "Blog — NASIHA",
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

const BLOG_SORT_COOKIE = "blog_sort";

const SORT_OPTIONS: { value: PostSort; label: string; icon: ReactNode }[] = [
  { value: "recent", label: "Most recent", icon: <Clock className="h-4 w-4" /> },
  { value: "viewed", label: "Most viewed", icon: <Eye className="h-4 w-4" /> },
  { value: "commented", label: "Most commented", icon: <MessageSquare className="h-4 w-4" /> },
];

function isPostSort(value: string | undefined): value is PostSort {
  return value === "recent" || value === "viewed" || value === "commented";
}

function buildSortHref(base: string, params: Record<string, string | undefined>, sort: PostSort): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  usp.set("sort", sort);
  return `${base}?${usp.toString()}`;
}

// /blog (§4.8) — public, member-authored blog list. `q` routes through
// Meilisearch (§7.2/§9), `category` filters plain Postgres — same split
// as getPublishedPosts implements.
export default async function BlogPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string; sort?: string };
}) {
  const user = await getSessionUser();
  const requestedSort = isPostSort(searchParams.sort) ? searchParams.sort : cookies().get(BLOG_SORT_COOKIE)?.value;
  const sort: PostSort = isPostSort(requestedSort) ? requestedSort : "recent";

  const [posts, categories] = await Promise.all([
    getPublishedPosts({ categorySlug: searchParams.category, q: searchParams.q, sort }),
    getPostCategories(),
  ]);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/blog.jpg" priority objectPosition="object-[center_62%]" />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Blogs</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Member-written posts on clinical practice, research, and community life.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-16">
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <CategoryChip href="/blog" active={!searchParams.category}>
                All
              </CategoryChip>
              {categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  href={`/blog?category=${category.slug}`}
                  active={searchParams.category === category.slug}
                >
                  {category.name}
                </CategoryChip>
              ))}
            </div>
            {user && (
              <Button asChild>
                <Link href="/blog/new">Write a Post</Link>
              </Button>
            )}
          </div>

          <form action="/blog" method="get" className="flex max-w-sm gap-2">
            {searchParams.category && (
              <input type="hidden" name="category" value={searchParams.category} />
            )}
            <Input type="search" name="q" defaultValue={searchParams.q} placeholder="Search posts…" />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
        </div>

        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {posts.length} {posts.length === 1 ? "Blog" : "Blogs"} found
          </p>
          <div className="flex items-center gap-1">
            {SORT_OPTIONS.map((option) => (
              <SortButton
                key={option.value}
                href={buildSortHref("/blog", { category: searchParams.category, q: searchParams.q }, option.value)}
                active={sort === option.value}
                label={option.label}
                icon={option.icon}
                cookieName={BLOG_SORT_COOKIE}
                cookieValue={option.value}
              />
            ))}
          </div>
        </div>
        <div className="mb-4 flex justify-end">
          <span className="text-xs text-muted-foreground">
            Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label.toLowerCase()}
          </span>
        </div>

        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground">
            {searchParams.q ? "No posts match your search." : "No posts published yet — check back soon."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <Reveal key={post.id} index={index} hover className="h-full">
                <PostCard post={post} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
