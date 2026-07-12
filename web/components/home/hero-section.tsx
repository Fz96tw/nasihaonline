import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ETHOS = ["Founding Cohort", "Knowledge Hours, Not Fees", "Free, Always & Forever"];

export function HeroSection() {
  return (
    <section className="px-8 pb-20 pt-24 text-center">
      <div className="mx-auto max-w-[960px]">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          A Global Learning Community
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Knowledge is better when we <em className="italic">share what we know</em>.
        </h1>
        <p className="mx-auto mt-6 max-w-[640px] text-lg text-muted-foreground">
          NASIHA is a global community where members are dedicated to free, reciprocal
          knowledge exchange — because every person who learns becomes a person who can
          teach.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/join">Join NASIHA</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#how-it-works">See How It Works</a>
          </Button>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {ETHOS.map((item) => (
            <Badge key={item} variant="info">
              {item}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
