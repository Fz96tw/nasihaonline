import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/home/reveal";

const TIERS = [
  {
    name: "Active Member",
    tagline: "Full contributors",
    description:
      "Regular contributors via teaching, reviewing, or research. Full access plus governance voting rights.",
    gradient: "from-blue-600 to-blue-900",
  },
  {
    name: "Associate",
    tagline: "Building momentum",
    description:
      "Newer members establishing their footing, growing toward Active status. Full community access.",
    gradient: "from-violet-600 to-violet-900",
  },
  {
    name: "Student / Trainee",
    tagline: "Future leaders",
    description:
      "Students and trainees with lighter contribution expectations. Full community access.",
    gradient: "from-cyan-600 to-cyan-900",
  },
  {
    name: "Friend of NASIHA",
    tagline: "Welcome, no strings",
    description:
      "No contribution obligation. Free/public content only — including the events calendar and recorded webinars.",
    gradient: "from-gray-500 to-gray-700",
  },
];

export function MembershipTiersSection() {
  return (
    <section className="bg-muted/40 px-8 py-16">
      <div className="mx-auto max-w-[960px]">
        <Reveal className="mx-auto max-w-[640px] text-center">
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
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier, index) => (
            <Reveal key={tier.name} index={index} hover>
              <Card
                className={cn(
                  "relative overflow-hidden border-none bg-gradient-to-br text-primary-foreground",
                  tier.gradient,
                )}
              >
                <div
                  aria-hidden="true"
                  className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary-foreground/10"
                />
                <CardHeader className="relative pb-2">
                  <CardTitle className="text-lg text-primary-foreground">
                    {tier.name}
                  </CardTitle>
                  <p className="text-xs text-primary-foreground/75">{tier.tagline}</p>
                </CardHeader>
                <CardContent className="relative pt-0 text-sm leading-relaxed text-primary-foreground/90">
                  {tier.description}
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
