import { Suspense } from "react";
import { HeroSection } from "@/components/home/hero-section";
import { WhatWeDoSection } from "@/components/home/what-we-do-section";
import { CommunitiesSection, CommunitiesSectionSkeleton } from "@/components/home/communities-section";
import { MembershipTiersSection } from "@/components/home/membership-tiers-section";
import { CtaBanner } from "@/components/home/cta-banner";

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
