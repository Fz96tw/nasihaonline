import { HeroSection } from "@/components/home/hero-section";
import { HowItWorksSection } from "@/components/home/how-it-works-section";
import { KnowledgeExchangeSection } from "@/components/home/knowledge-exchange-section";
import { MembershipTiersSection } from "@/components/home/membership-tiers-section";
import { CtaBanner } from "@/components/home/cta-banner";

export default function Home() {
  return (
    <main>
      <HeroSection />
      <HowItWorksSection />
      <KnowledgeExchangeSection />
      <MembershipTiersSection />
      <CtaBanner />
    </main>
  );
}
