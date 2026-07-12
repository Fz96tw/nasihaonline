import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    name: "Active Member",
    tagline: "Full contributors",
    description:
      "Regular contributors via teaching, reviewing, or research. Full access plus governance voting rights.",
    accent: "border-t-primary",
  },
  {
    name: "Associate",
    tagline: "Building momentum",
    description:
      "Newer members establishing their footing, growing toward Active status. Full community access.",
    accent: "border-t-success",
  },
  {
    name: "Student / Trainee",
    tagline: "Future leaders",
    description:
      "Students and trainees with lighter contribution expectations. Full community access.",
    accent: "border-t-accent",
  },
  {
    name: "Friend of Nasiha",
    tagline: "Welcome, no strings",
    description:
      "No contribution obligation. Free/public content only — including the events calendar and recorded webinars.",
    accent: "border-t-muted-foreground",
  },
];

export function MembershipTiersSection() {
  return (
    <section className="bg-muted/40 px-8 py-16">
      <div className="mx-auto max-w-[960px]">
        <div className="mx-auto max-w-[640px] text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Community
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Membership Tiers
          </h2>
          <p className="mt-3 text-muted-foreground">
            Open to all learners and teachers who share a passion for knowledge
            exchange.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <Card key={tier.name} className={cn("border-t-4", tier.accent)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{tier.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{tier.tagline}</p>
              </CardHeader>
              <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
                {tier.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
