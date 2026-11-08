import { Suspense } from "react";
import type { Metadata } from "next";
import { HeroSection } from "@/components/home/hero-section";
import { WhatWeDoSection } from "@/components/home/what-we-do-section";
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
