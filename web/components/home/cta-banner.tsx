import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
      <Image
        src="/images/meadow-morning.jpg"
        alt=""
        fill
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-hover/90 to-primary/80" />
      <div className="relative mx-auto max-w-[520px]">
        <h2 className="text-3xl font-bold tracking-tight">
          Ready to join the community?
        </h2>
        <p className="mt-3 leading-relaxed text-primary-foreground/90">
          Open to professionals, students and teachers who are enthusiastic about
          sharing their knowledge. No fees. Just knowledge.
        </p>
        <Button size="lg" variant="secondary" className="mt-8" asChild>
          <Link href="/join">Join NASIHA</Link>
        </Button>
      </div>
    </section>
  );
}
