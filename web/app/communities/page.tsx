import type { Metadata } from "next";
import Link from "next/link";
import { getAllCommunities } from "@/lib/profile-server";
import { Button } from "@/components/ui/button";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";

export const metadata: Metadata = {
  title: "Communities — NASIHA",
};

/**
 * Public counterpart to /my-communities (community-based-categorization
 * initiative, objective 7) — mirrors the /calendar-vs-/events split. No
 * personal membership state or join/leave controls here, just a browsable
 * list, since a signed-out visitor has no Profile to join with.
 */
export default async function CommunitiesPage() {
  const communities = await getAllCommunities();

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/mycommunities.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">
            Communities
          </h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            NASIHA groups its Library, Events, and Forums by broad topic area — browse what&rsquo;s available below.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[720px] flex-col gap-6 px-8 py-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {communities.map((community, index) => (
            <Reveal key={community.id} index={index} className="h-full">
              <div className="flex h-full flex-col gap-1 rounded-md border p-4">
                <p className="font-medium">{community.name}</p>
                <p className="text-sm text-muted-foreground">{community.description ?? "No description yet."}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <p className="text-muted-foreground">Sign in to join a community and personalize your feed.</p>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/join">Join NASIHA</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
