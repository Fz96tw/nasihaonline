import {
  Mic,
  MessageSquare,
  BookOpen,
  PenLine,
  HeartHandshake,
  Stethoscope,
  ClipboardList,
  MonitorPlay,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type WorkflowItem = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
};

/**
 * Trigger/confirmation copy is hardcoded, matching the earlier EARN_ITEMS/
 * SPEND_ITEMS/WORKFLOW_ITEMS precedent this file replaces — verified against
 * lib/contributions-server.ts, lib/meeting-requests-server.ts, and
 * lib/blog-server.ts at write-time, but not derived from ContributionRule, so
 * it can drift from actual code behavior. The code and PRD.md remain the
 * source of truth.
 */
const EARN_ITEMS: WorkflowItem[] = [
  {
    icon: Mic,
    label: "Lecture / webinar",
    value: "1 hr",
    detail:
      "Credited automatically when you host an event and attendance is recorded at the end of the session. No confirmation step is needed — the system already has proof you delivered it.",
  },
  {
    icon: MessageSquare,
    label: "Knowledge discussion",
    value: "0.5 hrs",
    detail:
      "Either logged yourself (naming the peer you spoke with) or created automatically for you when someone's meeting request to you is accepted. Either way, it needs that peer's confirmation before it counts — or an admin's, if no peer is named.",
  },
  {
    icon: BookOpen,
    label: "Curate resource",
    value: "0.5 hrs",
    detail:
      "Self-reported after the fact. If you name a peer who can vouch for it, they confirm it; otherwise it goes to an admin for review.",
  },
  {
    icon: PenLine,
    label: "Write a blog post",
    value: "0.5 hrs",
    detail:
      "Credited automatically the moment your post is published. Since there's no other member party to the act of publishing, an admin confirms it rather than a peer.",
  },
  {
    icon: HeartHandshake,
    label: "Administrative volunteer work",
    value: "2 hrs (varies)",
    detail:
      "Self-reported for behind-the-scenes work that keeps the community running. Since this kind of work has no natural peer to name, an admin confirms it.",
  },
];

const SPEND_ITEMS: WorkflowItem[] = [
  {
    icon: Stethoscope,
    label: "Expert consultation",
    value: "1 hr",
    detail:
      "Deducted automatically the moment the person you contacted accepts your meeting request. No confirmation step is needed — accepting the request is itself the proof.",
  },
  {
    icon: ClipboardList,
    label: "Research resource",
    value: "0.5 hrs",
    detail:
      "Priced in our rate card for lighter-weight asks. Today, every accepted meeting request posts at the Expert Consultation rate regardless of topic — a dedicated lighter-weight flow for this rate is on the roadmap.",
  },
  {
    icon: MonitorPlay,
    label: "Attend webinar",
    value: "Always free",
    detail: "Never touches the ledger — attending a session never costs Knowledge Hours.",
  },
];

function WorkflowAccordion({ items }: { items: WorkflowItem[] }) {
  return (
    <Accordion type="single" collapsible>
      {items.map((item) => (
        <AccordionItem key={item.label} value={item.label}>
          <AccordionTrigger className="text-left text-sm hover:no-underline">
            <span className="flex items-center gap-2">
              <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {item.label} · <strong className="font-semibold">{item.value}</strong>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{item.detail}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function KnowledgeExchangeTable() {
  return (
    <Card className="border-primary/15 bg-primary/5 p-5">
      <p className="text-sm font-semibold">How the Knowledge Exchange Works</p>
      <p className="mt-1 text-xs text-muted-foreground">
        How members earn and spend Knowledge Hours. Expand an entry to see what triggers the
        credit and who confirms it before it counts toward a balance.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">Earn by Teaching</p>
          <WorkflowAccordion items={EARN_ITEMS} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-accent">Spend to Learn</p>
          <WorkflowAccordion items={SPEND_ITEMS} />
        </div>
      </div>
    </Card>
  );
}
