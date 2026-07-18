import { KnowledgeExchangeTable } from "@/components/home/knowledge-exchange-table";
import { Reveal } from "@/components/home/reveal";

export function KnowledgeExchangeSection() {
  return (
    <section className="px-8 py-20">
      <div className="mx-auto max-w-[960px]">
        <Reveal>
          <div className="mx-auto max-w-[640px] text-center">
            <p className="text-base font-semibold uppercase tracking-wide text-primary">
              Our Currency
            </p>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              The NASIHA Knowledge Exchange System
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Every hour you teach or curate earns a Knowledge Hour, redeemable for
              expert knowledge in return. Hours are recognition, not gatekeeping —
              full access regardless of balance.
            </p>
          </div>
          <div className="mt-10">
            <KnowledgeExchangeTable />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
