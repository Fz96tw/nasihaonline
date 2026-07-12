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
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(10,20,60,.72),rgba(10,20,80,.58))]" />
      <div className="relative mx-auto max-w-[960px]">
        <p className="inline-block rounded-full border border-primary-foreground/25 bg-primary-foreground/[.15] px-4 py-[.35rem] text-xs font-semibold uppercase tracking-[.06em] text-[#e0eaff] backdrop-blur-sm">
          A Global Learning Community
        </p>
        <h1 className="mb-5 mt-6 text-[2.1rem] font-extrabold leading-[1.1] tracking-[-.02em] md:text-[3.25rem]">
          Knowledge is better when we{" "}
          <em className="text-blue-300 not-italic">share what we know</em>.
        </h1>
        <p className="mx-auto max-w-[640px] text-[1.15rem] leading-[1.7] text-primary-foreground/90">
          NASIHA is a global community where members are dedicated to free, reciprocal
          knowledge exchange — because every person who learns becomes a person who can
          teach.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="shadow-[0_4px_14px_rgba(37,99,235,0.5)]"
            asChild
          >
            <Link href="/join">Join NASIHA</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-primary-foreground/45 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
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
