import type { Metadata } from "next";
import { ActivityDetailPage } from "@/components/about/activity-detail";

export const metadata: Metadata = {
  title: "Peer Review & Feedback — NASIHA",
};

const SECTIONS = [
  {
    eyebrow: "What It Looks Like",
    title: "Evidence-Based Critique, Not Just Encouragement",
    body: "Members give each other honest, constructive feedback on work, research, and educational content — in forum threads, on blog posts, and in one-on-one expert consultations. The goal is genuine improvement, rooted in a shared commitment to growth across disciplines.",
  },
  {
    eyebrow: "Where It Happens",
    title: "Forums, Consultations, and Comments",
    body: "The Clinical Discussions forum hosts case-based questions and diagnostic feedback; Teaching & Mentorship covers pedagogical advice. For deeper feedback, any member can find an expert in the Directory and Request a Meeting for a structured consultation. Blog posts and library resources can also carry comments and community flags for accuracy.",
  },
  {
    eyebrow: "Trust & Safety",
    title: "De-Identified, Always",
    body: "Case-based discussion in the Clinical Discussions forum carries the same requirement as the Library and Case Discussion events: patient information must never appear in a post. Flagged content is reviewed by a Steward, with escalation to the Board if needed.",
  },
  {
    eyebrow: "Earning & Spending Knowledge Hours",
    title: "Reciprocity in Practice",
    body: "Requesting an expert consultation spends 1.0 Knowledge Hour; giving one earns the recipient 0.5 Hours once the requester confirms it took place. Requesting a research resource or case discussion spends 0.5 Hours. This reciprocal exchange — never purchasable, never transferable between members — is what keeps expertise flowing both ways.",
  },
];

const LINKS = [
  { label: "Browse the Forums", href: "/forums" },
  { label: "Find an Expert", href: "/members" },
];

export default function PeerReviewFeedbackPage() {
  return (
    <ActivityDetailPage
      image="/images/feedback.jpg"
      eyebrow="How It Works"
      title="Peer Review & Feedback"
      intro="Constructive, evidence-based critique of work, research, and educational content across disciplines — because every expert is also, still, a student."
      sections={SECTIONS}
      links={LINKS}
    />
  );
}
