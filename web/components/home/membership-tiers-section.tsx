import { Reveal } from "@/components/home/reveal";
import { TierCard } from "@/components/home/tier-card";
import { MEMBERSHIP_TIERS } from "@/lib/membership-tiers";

export function MembershipTiersSection() {
  return (
    <section className="bg-muted/40 px-8 py-20">
      <div className="mx-auto max-w-[960px]">
        <Reveal className="mx-auto max-w-[640px] text-center">
          <p className="text-base font-semibold uppercase tracking-wide text-primary">
            Community
          </p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
            Membership Tiers
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Open to all learners and teachers who share a passion for knowledge
            exchange.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {MEMBERSHIP_TIERS.map((tier, index) => (
            <TierCard key={tier.name} tier={tier} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
