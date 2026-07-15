import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Trigger/confirmation copy is hardcoded, matching the EARN_ITEMS/SPEND_ITEMS
 * precedent in knowledge-exchange-section.tsx — verified against
 * lib/contributions-server.ts, lib/meeting-requests-server.ts, and
 * lib/blog-server.ts at write-time, but not derived from ContributionRule, so
 * it can drift from actual code behavior. The code and PRD.md remain the
 * source of truth.
 */
const WORKFLOW_ITEMS = [
  {
    label: "Lecture / webinar — 1 hr",
    content:
      "Credited automatically when you host an event and attendance is recorded at the end of the session. No confirmation step is needed — the system already has proof you delivered it.",
  },
  {
    label: "Knowledge discussion — 0.5 hrs",
    content:
      "Either logged yourself (naming the peer you spoke with) or created automatically for you when someone's meeting request to you is accepted. Either way, it needs that peer's confirmation before it counts — or an admin's, if no peer is named.",
  },
  {
    label: "Curate resource — 0.5 hrs",
    content:
      "Self-reported after the fact. If you name a peer who can vouch for it, they confirm it; otherwise it goes to an admin for review.",
  },
  {
    label: "Write a blog post — 0.5 hrs",
    content:
      "Credited automatically the moment your post is published. Since there's no other member party to the act of publishing, an admin confirms it rather than a peer.",
  },
  {
    label: "Administrative volunteer work — 2 hrs (varies)",
    content:
      "Self-reported for behind-the-scenes work that keeps the community running. Since this kind of work has no natural peer to name, an admin confirms it.",
  },
  {
    label: "Expert consultation — 1 hr",
    content:
      "Deducted automatically the moment the person you contacted accepts your meeting request. No confirmation step is needed — accepting the request is itself the proof.",
  },
  {
    label: "Research resource / case discussion request — 0.5 hrs",
    content:
      "Priced in our rate card for lighter-weight asks. Today, every accepted meeting request posts at the Expert Consultation rate regardless of topic — a dedicated lighter-weight flow for this rate is on the roadmap.",
  },
  {
    label: "Attend webinar — always free",
    content: "Never touches the ledger — attending a session never costs Knowledge Hours.",
  },
];

export function ContributionWorkflowAccordion() {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold">How approval works</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Every entry above is a real ledger transaction. Here&apos;s what triggers it and who
        confirms it before it counts toward a balance.
      </p>
      <Accordion type="single" collapsible className="mt-3">
        {WORKFLOW_ITEMS.map((item) => (
          <AccordionItem key={item.label} value={item.label}>
            <AccordionTrigger className="text-left text-sm">{item.label}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{item.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Card>
  );
}
