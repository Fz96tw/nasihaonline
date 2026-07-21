import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About — NASIHA",
};

const VALUES = [
  {
    title: "Knowledge as a Common Good",
    body: "Knowledge should be shared, not hoarded. No exchange within NASIHA carries a fee.",
  },
  {
    title: "Reciprocity",
    body: "Those who receive guidance contribute in kind, sustaining a cycle of giving.",
  },
  {
    title: "Inclusion & Accessibility",
    body: "Open to members from all corners of the world, all career stages, all disciplines.",
  },
  {
    title: "Trust & Integrity",
    body: "Honest, evidence-based exchange. Knowledge shared responsibly.",
  },
  {
    title: "Humility & Lifelong Learning",
    body: "No one is only a teacher. Every expert is also a student.",
  },
];

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

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/blue-rain.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">NASIHA</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            <em className="not-italic text-[#93c5fd]">Sincere advice and guidance</em> — that&rsquo;s what NASIHA
            means, and what it was founded to give: knowledge as a shared resource, not a commodity.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-24">
        <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2">
          <div>
            <Reveal>
              <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-primary">
                Our Mission
              </p>
              <h2 className="mb-4 text-3xl font-extrabold tracking-[-.02em] md:text-4xl">Why We Exist</h2>
              <blockquote className="mb-7 border-l-[3px] border-primary pl-5 text-[1.35rem] italic leading-[1.8] text-foreground/80">
                &ldquo;NASIHA exists to spread knowledge — encouraging every one of us to learn,
                to teach, and to share freely with others.&rdquo;
              </blockquote>

              <p className="mb-3 mt-10 text-sm font-bold uppercase tracking-[.1em] text-primary">
                Values
              </p>
              <h3 className="mb-4 text-2xl font-extrabold tracking-[-.02em]">Core Principles</h3>
            </Reveal>
            <div className="flex flex-col gap-5">
              {VALUES.map((value, index) => (
                <Reveal key={value.title} index={index} hover>
                  <div className="rounded-[10px] border bg-card px-[1.1rem] py-[.85rem] text-lg shadow-sm">
                    <strong className="font-bold">{value.title}</strong> — {value.body}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal>
            <div className="relative mb-8 h-[340px] w-full overflow-hidden rounded-xl shadow-lg">
              <Image
                src="/images/174733785_orig.jpg"
                alt="NASIHA community"
                fill
                className="object-cover"
              />
            </div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-primary">Vision</p>
            <h3 className="mb-4 text-2xl font-extrabold tracking-[-.02em]">Our Vision</h3>
            <p className="mb-4 text-lg leading-[1.8] text-muted-foreground">
              A world where everyone has access to a trusted network of peers and
              experts committed to sharing what they know.
            </p>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
              <p className="mb-2 text-lg font-bold text-primary">Dedicated To</p>
              <p className="text-lg italic leading-[1.7] text-foreground/80">
                NASIHA — Dedicated to Narjis and Syed Iftikhar Hussain Abidi, who guided us toward a
                life of learning.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

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
        </div>
      </section>

      <section className="px-8 py-24 text-center">
        <Reveal>
          <h2 className="mb-4 text-3xl font-extrabold tracking-[-.02em] md:text-4xl">
            Ready to Join the Exchange?
          </h2>
          <p className="mx-auto mb-8 max-w-[520px] text-lg leading-[1.7] text-muted-foreground">
            Become part of a community dedicated to free, reciprocal knowledge exchange.
          </p>
          <Button size="lg" asChild>
            <Link href="/getinvolved">Get Involved</Link>
          </Button>
        </Reveal>
      </section>
    </main>
  );
}
