import { HeroSection } from "@/components/home/hero-section";
import { MembershipTiersSection } from "@/components/home/membership-tiers-section";
import { CtaBanner } from "@/components/home/cta-banner";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <MembershipTiersSection />
      <CtaBanner />
    </main>
  );
}
