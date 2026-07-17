import { Microscope, Eye, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/home/reveal";

const STEPS = [
  {
    icon: Microscope,
    title: "Research",
    description:
      "Members find and curate resources — articles, guidelines, readings — and share them with the community to deepen collective expertise.",
  },
  {
    icon: Eye,
    title: "Review",
    description:
      "Members guide each other to improve through honest, constructive feedback rooted in a shared commitment to growth.",
  },
  {
    icon: GraduationCap,
    title: "Teach",
    description:
      "Members share knowledge through lectures and case discussions — because knowledge is a common good.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-muted/40 px-8 py-16">
      <div className="mx-auto max-w-[960px]">
        <Reveal className="mx-auto max-w-[640px] text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            The Model
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            How NASIHA Works
          </h2>
          <p className="mt-3 text-muted-foreground">
            A pay-it-forward model where every act of teaching enables an act of
            learning.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, description }, index) => (
            <Reveal key={title} index={index} hover>
              <Card className="text-center">
                <CardHeader className="items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
