import Link from "next/link";
import { Mic, MessageSquare, BookOpen, Stethoscope, ClipboardList, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const EARN_ITEMS = [
  { icon: Mic, label: "Lecture / webinar", value: "1 hr" },
  { icon: MessageSquare, label: "Knowledge discussion", value: "0.5 hrs" },
  { icon: BookOpen, label: "Curate resource", value: "0.5 hrs" },
];

const SPEND_ITEMS = [
  { icon: Stethoscope, label: "Expert consultation", value: "1 hr" },
  { icon: ClipboardList, label: "Research resource", value: "0.5 hrs" },
  { icon: MonitorPlay, label: "Attend webinar", value: "Always free" },
];

function ExchangeRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mic;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex items-center gap-2 p-3 text-xs">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span>
        {label} · <strong className="font-semibold">{value}</strong>
      </span>
    </Card>
  );
}

export function KnowledgeExchangeSection() {
  return (
    <section className="px-8 py-16">
      <div className="mx-auto grid max-w-[960px] grid-cols-1 items-start gap-12 lg:grid-cols-2">
        <div>
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
        <Card className="bg-secondary/40 p-5">
          <p className="text-sm font-semibold">How the Knowledge Exchange Works</p>
          <p className="mt-1 text-xs text-muted-foreground">
            How members earn and spend Knowledge Hours
          </p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold text-primary">
                Earn by Teaching
              </p>
              <div className="space-y-2">
                {EARN_ITEMS.map((item) => (
                  <ExchangeRow key={item.label} {...item} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold text-accent">Spend to Learn</p>
              <div className="space-y-2">
                {SPEND_ITEMS.map((item) => (
                  <ExchangeRow key={item.label} {...item} />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
