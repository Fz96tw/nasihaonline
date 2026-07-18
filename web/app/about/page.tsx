import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Microscope, Eye, GraduationCap } from "lucide-react";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";
import { Button } from "@/components/ui/button";

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
    icon: Microscope,
    title: "Research & Curation",
    body: "Finding, annotating, and sharing high-quality literature, guidelines, and resources across all fields of knowledge.",
  },
  {
    icon: Eye,
    title: "Peer Review & Feedback",
    body: "Constructive, evidence-based critique of work, research, and educational content across disciplines.",
  },
  {
    icon: GraduationCap,
    title: "Teaching & Sharing",
    body: "Lectures, webinars, and knowledge discussions — sharing expertise freely across the community.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/blue-rain.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.65)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.4rem] font-extrabold tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)]">About NASIHA</h1>
          <p className="text-lg leading-[1.7] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)]">
            NASIHA — meaning <em className="not-italic text-[#93c5fd]">sincere advice and guidance</em> — was
            founded on the belief that knowledge is a shared resource, not a commodity.
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

              <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-primary">
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
            {ACTIVITIES.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} index={index} hover>
                <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-[26px] w-[26px]" strokeWidth={1.5} />
                  </div>
                  <p className="mb-2 text-lg font-bold">{title}</p>
                  <p className="text-lg leading-[1.7] text-muted-foreground">{body}</p>
                </div>
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
