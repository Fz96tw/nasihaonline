import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const ETHOS = ["Founding Cohort", "Knowledge Hours, Not Fees", "Free, Always & Forever"];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-8 pb-20 pt-24 text-center text-primary-foreground">
      <Image
        src="/images/lighthouse.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-foreground/80 to-primary-hover/70" />
      <div className="relative mx-auto max-w-[960px]">
        <p className="inline-block rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground backdrop-blur-sm">
          A Global Learning Community
        </p>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Knowledge is better when we{" "}
          <em className="text-accent not-italic">share what we know</em>.
        </h1>
        <p className="mx-auto mt-6 max-w-[640px] text-lg text-primary-foreground/90">
          NASIHA is a global community where members are dedicated to free, reciprocal
          knowledge exchange — because every person who learns becomes a person who can
          teach.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/join">Join NASIHA</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
            asChild
          >
            <a href="#how-it-works">See How It Works</a>
          </Button>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {ETHOS.map((item) => (
            <span
              key={item}
              className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-medium text-primary-foreground backdrop-blur-sm"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
