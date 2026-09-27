import type { Metadata } from "next";
import { ActivityDetailPage } from "@/components/about/activity-detail";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Peer Review & Feedback",
  description:
    "How NASIHA members give and receive structured peer review and feedback on each other's work.",
  path: "/about/peer-review-feedback",
});

const SECTIONS = [
  {
    eyebrow: "What It Looks Like",
    title: "Evidence-Based Critique, Not Just Encouragement",
    body: "Submit your own work — a paper, a project, a write-up, anything worth a second set of eyes — and invite specific reviewers, open it to volunteers from across the community, or both. Reviewers leave threaded feedback right on the submission; once you're satisfied with it, the polished result can go straight into the Knowledge Library. The goal is genuine improvement, rooted in a shared commitment to growth — whatever field the work is in.",
  },
  {
    eyebrow: "Where It Happens",
    title: "The Review & Feedback Dashboard, Forums, and Consultations",
    body: "Your own submissions, items shared with you, and open calls for volunteer reviewers all live on the Review & Feedback dashboard. For lighter-weight discussion, Teaching & Mentorship covers pedagogical advice and mentorship requests, and Research & Resources is where members debate what's worth curating next. For deeper, one-on-one feedback, any member can find an expert in the Directory and Request a Meeting for a structured consultation.",
  },
  {
    eyebrow: "Trust & Safety",
    title: "De-Identified Where It Matters",
    body: "Case-based submissions — case studies in the Knowledge Library, Case Discussion events, and any review item built around one — carry the same requirement: identifiable patient information must never appear. Every other submission follows the community's general Code of Conduct. Flagged content is reviewed by a Steward, with escalation to the Board if needed.",
  },
  {
    eyebrow: "Earning & Spending Knowledge Hours",
    title: "Reciprocity in Practice",
    body: "Requesting an expert consultation spends 1.0 Knowledge Hour; giving one earns the consultant 0.5 Hours once the requester confirms it took place. Requesting a research resource or case discussion spends 0.5 Hours, and reviewing someone else's submission earns 0.5 Hours once they confirm it. This reciprocal exchange — never purchasable, never transferable between members — is what keeps expertise flowing both ways.",
  },
];

const LINKS = [
  { label: "Find an Expert", href: "/members" },
  { label: "Browse Review & Feedback", href: "/review-feedback" },
];

export default function PeerReviewFeedbackPage() {
  return (
    <ActivityDetailPage
      image="/images/feedback.jpg"
      eyebrow="How It Works"
      title="Peer Review & Feedback"
      path="/about/peer-review-feedback"
      intro="Constructive, evidence-based critique of work, research, and projects across every field members bring to NASIHA — because every expert is also, still, a student."
      sections={SECTIONS}
      links={LINKS}
    />
  );
}
