import { TierCard } from "@/components/home/tier-card";
import { MEMBERSHIP_TIERS } from "@/lib/membership-tiers";

export function TierPreviewStrip() {
  return (
    <section className="border-b bg-muted/40 px-8 py-10">
      <div className="mx-auto max-w-xl">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
          Membership Tiers
        </p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Tap a tile for what each tier includes.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MEMBERSHIP_TIERS.map((tier, index) => (
            <TierCard key={tier.name} tier={tier} index={index} compact />
          ))}
        </div>
      </div>
    </section>
  );
}
