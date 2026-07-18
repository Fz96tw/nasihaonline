import Image from "next/image";
import { Microscope, Eye, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/home/reveal";
import { cn } from "@/lib/utils";

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
    <section id="how-it-works" className="bg-muted/40 px-8 py-20">
      <div className="mx-auto max-w-[960px]">
        <Reveal className="mx-auto max-w-[640px] text-center">
          <p className="text-base font-semibold uppercase tracking-wide text-primary">
            The Model
          </p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
            How NASIHA Works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A pay-it-forward model where every act of teaching enables an act of
            learning.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, description, image }, index) => (
            <Reveal key={title} index={index} hover className="h-full">
              <Card className="relative h-full min-h-[280px] overflow-hidden text-center">
                {image && (
                  <>
                    <Image src={image} alt="" fill className="object-cover" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,20,60,.55),rgba(10,20,80,.8))]" />
                  </>
                )}
                <CardHeader className="relative items-center">
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full",
                      image
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle
                    className={cn(
                      "text-xl",
                      image &&
                        "text-primary-foreground [text-shadow:0_1px_8px_rgba(0,10,40,.55)]",
                    )}
                  >
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent
                  className={cn(
                    "relative pt-0 text-lg leading-relaxed",
                    image
                      ? "text-primary-foreground/90 [text-shadow:0_1px_8px_rgba(0,10,40,.55)]"
                      : "text-muted-foreground",
                  )}
                >
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
