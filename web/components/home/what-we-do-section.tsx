import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/home/reveal";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACTIVITIES = [
  {
    image: "/images/curation.jpg",
    title: "Research & Curation",
    body: "Curating and sharing trusted resources across every field.",
    href: "/about/research-curation",
  },
  {
    image: "/images/feedback.jpg",
    title: "Peer Review & Feedback",
    body: "Constructive, evidence-based feedback across disciplines.",
    href: "/about/peer-review-feedback",
  },
  {
    image: "/images/teach.jpg",
    title: "Teaching & Sharing",
    body: "Sharing expertise through lectures, webinars, and discussions.",
    href: "/about/teaching-sharing",
  },
];

export function WhatWeDoSection() {
  return (
    <section className="bg-muted px-8 py-24">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="mb-10 text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-primary">
            Activities
          </p>
          <h2 className="text-3xl font-extrabold tracking-[-.02em] md:text-4xl">What We Do</h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {ACTIVITIES.map(({ image, title, body, href }, index) => (
            <Reveal key={title} index={index} hover className="h-full">
              <Link
                href={href}
                className="flex h-full flex-col overflow-hidden rounded-xl border bg-card text-center shadow-sm"
              >
                <div className="relative h-40 w-full shrink-0">
                  <Image src={image} alt="" fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <p className="absolute inset-x-0 bottom-3 px-4 text-2xl font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)]">
                    {title}
                  </p>
                </div>
                <div className="flex flex-1 flex-col p-6 pt-4">
                  <p className="mb-4 flex-1 text-lg leading-[1.7] text-muted-foreground">{body}</p>
                  <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mx-auto")}>
                    Learn More
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/contact">Contact Us</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
