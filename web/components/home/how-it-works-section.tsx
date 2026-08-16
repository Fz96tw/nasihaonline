import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/home/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    image: "/images/curation.jpg",
    title: "Research & Curation",
    description: "Find, curate, and share resources that deepen collective expertise.",
    href: "/about/research-curation",
    links: [
      { label: "Browse the Library", href: "/library" },
      { label: "See Research Discussions", href: "/forums" },
    ],
  },
  {
    image: "/images/feedback.jpg",
    title: "Peer Review & Feedback",
    description: "Guide each other with honest, constructive feedback.",
    href: "/about/peer-review-feedback",
    links: [
      { label: "Find an Expert", href: "/members" },
      { label: "Browse Review & Feedback", href: "/review-feedback" },
    ],
  },
  {
    image: "/images/teach.jpg",
    title: "Teaching & Sharing",
    description: "Share knowledge through lectures and case discussions.",
    href: "/about/teaching-sharing",
    links: [
      { label: "Upcoming Events", href: "/events" },
      { label: "Browse the Forums", href: "/forums" },
    ],
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
          {STEPS.map(({ image, title, description, href, links }, index) => (
            <Reveal key={title} index={index} hover className="h-full">
              <Card className="relative flex h-full min-h-[280px] flex-col overflow-hidden text-center">
                <Link href={href} className="relative block h-40 w-full shrink-0">
                  <Image src={image} alt="" fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <p className="absolute inset-x-0 bottom-3 px-4 text-2xl font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)]">
                    {title}
                  </p>
                </Link>
                <CardContent className="relative flex flex-1 flex-col pt-4 text-lg leading-relaxed text-muted-foreground">
                  <Link href={href} className="flex-1">
                    <p>{description}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      Learn more <span aria-hidden="true">&rarr;</span>
                    </span>
                  </Link>
                  <div className="mt-4 flex flex-col gap-2">
                    {links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-auto w-full whitespace-normal py-2 text-center leading-tight",
                        )}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
