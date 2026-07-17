import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/home/count-up";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { db } from "@/lib/db";
import { LedgerStatus, LedgerTransactionType, Tier } from "@/lib/generated/prisma/enums";

const MEMBERSHIP_TIER_COUNT = Object.keys(Tier).length;

const STATIC_STATS: { val: number | string; lbl: string }[] = [
  { val: MEMBERSHIP_TIER_COUNT, lbl: "Membership Tiers" },
  { val: "Free", lbl: "Always & Forever" },
];

export async function HeroSection() {
  const [memberCount, confirmedHoursEarned] = await Promise.all([
    db.user.count(),
    db.contributionLedger.aggregate({
      where: { status: LedgerStatus.confirmed, type: LedgerTransactionType.earned },
      _sum: { hours: true },
    }),
  ]);
  const totalKnowledgeHours = Math.round(confirmedHoursEarned._sum.hours?.toNumber() ?? 0);
  const stats = [
    { val: memberCount, lbl: "Members" },
    { val: totalKnowledgeHours, lbl: "Knowledge Hours Shared" },
    ...STATIC_STATS,
  ];

  return (
    <section className="relative overflow-hidden px-8 pb-12 pt-14 text-center text-primary-foreground">
      <ParallaxHeroImage src="/images/lighthouse-shifted.jpg" priority />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(10,20,60,.25),rgba(10,20,80,.15))]" />
      <div className="relative mx-auto max-w-[960px]">
        <p className="inline-block rounded-full border border-primary-foreground/25 bg-primary-foreground/[.15] px-4 py-[.35rem] text-sm font-semibold uppercase tracking-[.06em] text-[#e0eaff] backdrop-blur-sm [text-shadow:0_1px_6px_rgba(0,10,40,.55)]">
          A Learning Community
        </p>
        <h1 className="mb-6 mt-7 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[4rem]">
          Knowledge is better when we{" "}
          <em className="text-blue-300 not-italic">share what we know</em>.
        </h1>
        <p className="mx-auto max-w-[640px] text-[1.25rem] leading-[1.7] text-primary-foreground [text-shadow:0_1px_10px_rgba(0,10,40,.6)]">
          NASIHA is a global community where members are dedicated to free, reciprocal
          knowledge exchange — because every person who learns becomes a person who can
          teach.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Button
            size="lg"
            className="w-full shadow-[0_4px_14px_rgba(37,99,235,0.5)] sm:w-auto"
            asChild
          >
            <Link href="/join">Join NASIHA</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full border-primary-foreground/60 bg-primary-foreground/15 text-primary-foreground [text-shadow:0_1px_8px_rgba(0,10,40,.55)] hover:bg-primary-foreground/25 hover:text-primary-foreground sm:w-auto"
            asChild
          >
            <a href="#how-it-works">See How It Works</a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full border-primary-foreground/60 bg-primary-foreground/15 text-primary-foreground [text-shadow:0_1px_8px_rgba(0,10,40,.55)] hover:bg-primary-foreground/25 hover:text-primary-foreground sm:w-auto"
            asChild
          >
            <Link href="/donate">Donate</Link>
          </Button>
        </div>
        <div className="mt-14 flex flex-wrap justify-center gap-12 border-t border-primary-foreground/20 pt-8">
          {stats.map((stat) => (
            <div key={stat.lbl}>
              <div className="text-[2.25rem] font-extrabold text-blue-300 [text-shadow:0_2px_12px_rgba(0,10,40,.6)]">
                {typeof stat.val === "number" ? <CountUp value={stat.val} /> : stat.val}
              </div>
              <div className="text-sm font-semibold uppercase tracking-[.06em] text-primary-foreground [text-shadow:0_1px_8px_rgba(0,10,40,.55)]">
                {stat.lbl}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
