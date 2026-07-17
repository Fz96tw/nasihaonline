import type { Metadata } from "next";
import { db } from "@/lib/db";
import { withSignedPhotoUrls } from "@/lib/team-server";
import { TeamMemberCard } from "@/components/team/team-member-card";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";

export const metadata: Metadata = {
  title: "Our Team — NASIHA",
};

export default async function OurTeamPage() {
  const members = await db.teamMember.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
  });
  const withPhotos = await withSignedPhotoUrls(members);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/brick-texture.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(10,20,60,.75),rgba(10,20,80,.6))]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.4rem] font-extrabold tracking-[-.02em]">Our Team</h1>
          <p className="text-base leading-[1.7] opacity-[.88]">
            Meet the founders, board members, and partners behind NASIHA.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-16">
        {withPhotos.length === 0 ? (
          <p className="text-center text-muted-foreground">Team information coming soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {withPhotos.map((member, index) => (
              <Reveal key={member.id} index={index} hover>
                <TeamMemberCard member={member} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
