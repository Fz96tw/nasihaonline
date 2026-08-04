import { HeroSection } from "@/components/home/hero-section";
import { WhatWeDoSection } from "@/components/home/what-we-do-section";
import { MembershipTiersSection } from "@/components/home/membership-tiers-section";
import { CtaBanner } from "@/components/home/cta-banner";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <WhatWeDoSection />
      <MembershipTiersSection />
      <CtaBanner />
    </main>
  );
}
