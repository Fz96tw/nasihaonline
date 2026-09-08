import { Suspense } from "react";
import type { Metadata } from "next";
import { HeroSection } from "@/components/home/hero-section";
import { WhatWeDoSection } from "@/components/home/what-we-do-section";
import { CommunitiesSection, CommunitiesSectionSkeleton } from "@/components/home/communities-section";
import { MembershipTiersSection } from "@/components/home/membership-tiers-section";
import { CtaBanner } from "@/components/home/cta-banner";

// No `title` key here on purpose — the home page keeps the root layout's
// `title.default` rather than running through the title template.
export const metadata: Metadata = {
  description:
    "Join NASIHA, a member-driven community for knowledge sharing, research curation, teaching, and peer feedback among professionals across many fields.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main>
      <HeroSection />
      <WhatWeDoSection />
      <Suspense fallback={<CommunitiesSectionSkeleton />}>
        <CommunitiesSection />
      </Suspense>
      <MembershipTiersSection />
      <CtaBanner />
    </main>
  );
}
