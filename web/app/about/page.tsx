import type { Metadata } from "next";
import Image from "next/image";
import { Microscope, Eye, GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "About — Nasiha",
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
      <section
        className="relative overflow-hidden bg-cover bg-center px-8 py-16 text-center text-primary-foreground"
        style={{ backgroundImage: "url(/images/blue-rain.jpg)" }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,20,60,.75),rgba(10,20,80,.6))]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.4rem] font-extrabold tracking-[-.02em]">About Nasiha</h1>
          <p className="text-base leading-[1.7] opacity-[.88]">
            Nasiha — meaning <em className="not-italic text-[#93c5fd]">sincere advice and guidance</em> — was
            founded on the belief that knowledge is a shared resource, not a commodity.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-20">
        <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-primary">
              Our Mission
            </p>
            <h2 className="mb-3 text-2xl font-extrabold tracking-[-.02em]">Why We Exist</h2>
            <blockquote className="mb-7 border-l-[3px] border-primary pl-5 text-[1.05rem] italic leading-[1.8] text-foreground/80">
              &ldquo;NASIHA is dedicated to spreading knowledge by encouraging each one of us to learn
              and to teach. We exist to create a community of learners focused on knowledge sharing —
              one that acknowledges the willingness of those around us who help us learn, and that
              shares knowledge freely with others.&rdquo;
            </blockquote>

            <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-primary">Values</p>
            <h3 className="mb-3 text-xl font-extrabold tracking-[-.02em]">Core Principles</h3>
            <div className="flex flex-col gap-3">
              {VALUES.map((value) => (
                <div
                  key={value.title}
                  className="rounded-[10px] border bg-card px-[1.1rem] py-[.85rem] text-sm shadow-sm"
                >
                  <strong className="font-bold">{value.title}</strong> — {value.body}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="relative mb-8 h-[340px] w-full overflow-hidden rounded-xl shadow-lg">
              <Image
                src="/images/174733785_orig.jpg"
                alt="Nasiha community"
                fill
                className="object-cover"
              />
            </div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-primary">Vision</p>
            <h3 className="mb-3 text-xl font-extrabold tracking-[-.02em]">Our Vision</h3>
            <p className="mb-4 leading-[1.8] text-muted-foreground">
              A world in which every person — regardless of where they live, what they can afford, or
              where they are in their path to learning — has access to a trusted network of peers,
              advisors, and experts committed to the advancement of their craft and sharing their
              knowledge.
            </p>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
              <p className="mb-2 font-bold text-primary">Dedicated To</p>
              <p className="text-sm italic leading-[1.7] text-foreground/80">
                NASIHA — Dedicated to Narjis and Syed Iftikhar Hussain Abidi, who guided us toward a
                life of learning.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted px-8 py-20">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-10 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-primary">
              Activities
            </p>
            <h2 className="text-2xl font-extrabold tracking-[-.02em]">What We Do</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {ACTIVITIES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border bg-card p-6 text-center shadow-sm"
              >
                <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[26px] w-[26px]" strokeWidth={1.5} />
                </div>
                <p className="mb-2 font-bold">{title}</p>
                <p className="text-sm leading-[1.7] text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
