import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="bg-primary px-8 py-16 text-center text-primary-foreground">
      <div className="mx-auto max-w-[520px]">
        <h2 className="text-3xl font-bold tracking-tight">
          Ready to join the community?
        </h2>
        <p className="mt-3 leading-relaxed opacity-90">
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
