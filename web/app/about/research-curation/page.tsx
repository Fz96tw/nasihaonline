import type { Metadata } from "next";
import { ActivityDetailPage } from "@/components/about/activity-detail";

export const metadata: Metadata = {
  title: "Research & Curation — NASIHA",
};

const SECTIONS = [
  {
    eyebrow: "What It Looks Like",
    title: "Finding and Sharing What's Worth Knowing",
    body: "Members surface high-quality literature, guidelines, articles, and recorded lectures, then annotate and tag them so the rest of the community can actually find and use them — not just link-dropping, but curation with context.",
  },
  {
    eyebrow: "Where It Happens",
    title: "The Knowledge Library",
    body: "Submitted resources — articles, guidelines, case studies, and recorded lectures — live in the searchable Knowledge Library, filterable by content type, specialty, and career stage (Student-Friendly, Early Career, Advanced, or All Levels). The Research & Resources forum is the discussion space for surfacing and debating what's worth curating next.",
  },
  {
    eyebrow: "Quality & Trust",
    title: "Reviewed Before It's Published",
    body: "New submissions enter a review queue and are checked by a Library Steward — a volunteer member with moderation access — for quality, correct tagging, and de-identification before going live. Case studies require an explicit confirmation that no identifiable patient information is included. Once published, any member can flag a resource as inaccurate or outdated for a Steward to re-review.",
  },
  {
    eyebrow: "Earning Knowledge Hours",
    title: "Recognized for the Time It Takes",
    body: "Curating a resource earns 0.5 Knowledge Hours once confirmed — by an admin, since solo curation has no counterpart to confirm it directly. Knowledge Hours are a recognition system, not a paywall: your full access to NASIHA never depends on your balance.",
  },
];

const LINKS = [
  { label: "Browse the Library", href: "/library" },
  { label: "Research & Resources Forum", href: "/forums" },
];

export default function ResearchCurationPage() {
  return (
    <ActivityDetailPage
      image="/images/curation.jpg"
      eyebrow="How It Works"
      title="Research & Curation"
      intro="Finding, annotating, and sharing high-quality literature, guidelines, and resources across all fields of knowledge — so good work doesn't stay buried in one person's inbox."
      sections={SECTIONS}
      links={LINKS}
    />
  );
}
