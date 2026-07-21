import type { Metadata } from "next";
import { ActivityDetailPage } from "@/components/about/activity-detail";

export const metadata: Metadata = {
  title: "Teaching & Sharing — NASIHA",
};

const SECTIONS = [
  {
    eyebrow: "What It Looks Like",
    title: "Expertise, Shared Freely",
    body: "Members host lectures, webinars, workshops, and case discussions, and publish articles to the community blog. Nothing carries a fee — teaching is treated as a contribution to the community, not a service sold to it.",
  },
  {
    eyebrow: "Where It Happens",
    title: "Events and the Blog",
    body: "Any member can submit an event — Webinar, Workshop, Case Discussion, Student Event, Roundtable, or Lecture — to the shared Calendar; other members RSVP and attend over Zoom or Google Meet. The Blog is open to member-authored articles and case write-ups, and the Teaching & Mentorship forum is where mentorship offers and pedagogical questions live.",
  },
  {
    eyebrow: "Trust & Safety",
    title: "Case Discussions, De-Identified",
    body: "Submitting a Case Discussion event requires an explicit confirmation that no identifiable patient information will be shared — the same standard applied across the Knowledge Library and Clinical Discussions forum.",
  },
  {
    eyebrow: "Earning Knowledge Hours",
    title: "Credit for Every Session",
    body: "Hosting a lecture or webinar earns 1.0 Knowledge Hour, automatically posted once attendance is recorded — no form to fill out. A knowledge discussion earns 0.5 Hours, and publishing a blog post earns 0.5 Hours once an admin confirms it. Attending an event, on the other hand, is always free.",
  },
];

const LINKS = [
  { label: "Upcoming Events", href: "/events" },
  { label: "Read the Blog", href: "/blog" },
];

export default function TeachingSharingPage() {
  return (
    <ActivityDetailPage
      image="/images/teach.jpg"
      eyebrow="How It Works"
      title="Teaching & Sharing"
      intro="Lectures, webinars, and knowledge discussions — sharing expertise freely across the community, because knowledge is a common good."
      sections={SECTIONS}
      links={LINKS}
    />
  );
}
