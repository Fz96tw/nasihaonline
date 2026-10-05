import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMyPeople } from "@/lib/member-follows-server";
import { MemberCard } from "@/components/members/member-card";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { BackLink } from "@/components/back-link";

export const metadata: Metadata = {
  title: "My People",
};

/**
 * Private list of the members the viewer has followed. Always the signed-in
 * member's own list — there is no way to request someone else's.
 */
export default async function MyPeoplePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const people = await getMyPeople(user.id);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/members3.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">My People</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Members you&apos;ve followed, for one-click access. Only you can see this list.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-16">
        <BackLink fallbackHref="/members" />
        {people.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed p-10 text-center">
            <p className="font-semibold">You haven&apos;t followed anyone yet.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Use Follow on a member&apos;s card, profile, or post to keep them here. They aren&apos;t notified.
            </p>
            <Link href="/members" className="text-sm font-medium text-primary hover:underline">
              Browse the Member Directory
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {people.length} {people.length === 1 ? "person" : "people"}. Open a profile to message someone or request a 1:1.
            </p>
            <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {people.map((member) => (
                <MemberCard key={member.id} member={member} currentUserId={user.id} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
