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
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(30,58,138,.88),rgba(37,99,235,.75))]" />
      <div className="relative mx-auto max-w-[520px]">
        <h2 className="mb-3 text-[1.9rem] font-extrabold tracking-[-.02em]">
          Ready to join the community?
        </h2>
        <p className="mx-auto mb-8 max-w-[520px] text-[1.05rem] leading-[1.7] opacity-[.88]">
          Open to professionals, students and teachers who are enthusiastic about
          sharing their knowledge. No fees. Just knowledge.
        </p>
        <Button
          size="lg"
          className="shadow-[0_4px_14px_rgba(37,99,235,0.5)]"
          asChild
        >
          <Link href="/join">Join NASIHA</Link>
        </Button>
      </div>
    </section>
  );
}
