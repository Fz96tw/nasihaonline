import { Suspense } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { buildWebSiteJsonLd } from "@/lib/json-ld";
import { HeroSection } from "@/components/home/hero-section";
import { WhatWeDoSection } from "@/components/home/what-we-do-section";
import { EventsCalendarSection, EventsCalendarSectionSkeleton } from "@/components/home/events-calendar-section";
import { CommunitiesSection, CommunitiesSectionSkeleton } from "@/components/home/communities-section";
import { MembershipTiersSection } from "@/components/home/membership-tiers-section";
import { CtaBanner } from "@/components/home/cta-banner";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "NASIHA — Professional Knowledge Sharing & Expert Network",
  description:
    "NASIHA is a fee-free professional community where experts share knowledge, curate research, teach, mentor, and give peer feedback across many fields.",
  path: "/",
});

export default function Home() {
  return (
    // Sections alternate grey/white. When Upcoming Events hides itself (no
    // events), two grey sections meet — a hairline keeps them from merging
    // into one block. Suspense adds no DOM wrapper, so they're siblings here.
    <main className="[&>section.bg-muted+section.bg-muted]:border-t">
      <JsonLd data={buildWebSiteJsonLd()} />
      <HeroSection />
      <WhatWeDoSection />
      <Suspense fallback={<EventsCalendarSectionSkeleton />}>
        <EventsCalendarSection />
      </Suspense>
      <Suspense fallback={<CommunitiesSectionSkeleton />}>
        <CommunitiesSection />
      </Suspense>
      <MembershipTiersSection />
      <CtaBanner />
    </main>
  );
}
