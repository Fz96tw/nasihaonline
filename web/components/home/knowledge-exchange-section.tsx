import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KnowledgeExchangeTable } from "@/components/home/knowledge-exchange-table";

export function KnowledgeExchangeSection() {
  return (
    <section className="px-8 py-16">
      <div className="mx-auto max-w-[960px]">
        <div className="max-w-[640px]">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Our Currency
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            The NASIHA Knowledge Exchange System
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Every hour you contribute — teaching, curating — earns you one Knowledge
            Hour. Hours can be spent to access expert knowledge in return.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Critically:</strong> Knowledge Hours
            are recognition, not gatekeeping. All members retain full access to the
            community regardless of their balance.
          </p>
          <Button variant="outline" className="mt-2" asChild>
            <Link href="/join">See How to Join →</Link>
          </Button>
        </div>
        <div className="mt-10">
          <KnowledgeExchangeTable />
        </div>
      </div>
    </section>
  );
}
