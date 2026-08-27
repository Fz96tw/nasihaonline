"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HowItWorksSection } from "@/components/home/how-it-works-section";
import { KnowledgeExchangeSection } from "@/components/home/knowledge-exchange-section";
import { JoinForm } from "@/components/join-form";
import { TierPreviewStrip } from "@/components/join/tier-preview-strip";
import { DonateForm } from "@/components/donate-form";
import { DonateInfoBlurb } from "@/components/donate-info-blurb";
import type { AdmissionPhase } from "@/lib/generated/prisma/enums";

const TAB_VALUES = ["how-it-works", "join", "support"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | undefined): value is TabValue {
  return TAB_VALUES.includes(value as TabValue);
}

export function GetInvolvedTabs({
  phase,
  defaultName,
  defaultEmail,
  success,
  canceled,
  initialTab,
}: {
  phase: AdmissionPhase;
  defaultName?: string;
  defaultEmail?: string;
  success?: boolean;
  canceled?: boolean;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<TabValue>(
    isTabValue(initialTab) ? initialTab : "how-it-works",
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(isTabValue(value) ? value : "how-it-works")}
    >
      <div className="mx-auto max-w-6xl px-4 pt-12 md:px-8">
        <TabsList
          className="h-auto w-full items-end justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
        >
          <TabsTrigger
            value="how-it-works"
            className="shrink-0 rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-3 text-base font-semibold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-5 sm:text-lg"
          >
            How NASIHA Works
          </TabsTrigger>
          <TabsTrigger
            value="join"
            className="shrink-0 rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-3 text-base font-semibold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-5 sm:text-lg"
          >
            Join NASIHA
          </TabsTrigger>
          <TabsTrigger
            value="support"
            className="shrink-0 rounded-t-lg rounded-b-none border border-b-0 border-transparent px-3 py-3 text-base font-semibold text-muted-foreground shadow-none data-[state=active]:-mb-px data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none sm:px-5 sm:text-lg"
          >
            Support NASIHA
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="how-it-works" className="mt-0">
        <div className="mx-auto max-w-6xl border-t border-border px-4 md:px-8" />
        <HowItWorksSection />
        <KnowledgeExchangeSection />
        <div className="px-8 pb-20 text-center">
          <Button variant="outline" asChild>
            <Link href="/join">See How to Join →</Link>
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="join" className="mt-0">
        <TierPreviewStrip />
        <div className="mx-auto max-w-6xl rounded-b-lg border border-t-0 border-border bg-background px-4 py-12 md:px-8">
          <JoinForm phase={phase} />
        </div>
      </TabsContent>

      <TabsContent value="support" className="mt-0">
        <div className="mx-auto max-w-6xl rounded-b-lg rounded-tr-lg border border-border bg-background px-4 py-12 md:px-8">
          {success ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight">Thank you!</h2>
              <p className="max-w-md text-muted-foreground">
                Your donation is being processed. You&rsquo;ll receive a receipt from Stripe
                by email shortly.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <DonateInfoBlurb />
              </div>
              <DonateForm
                defaultName={defaultName}
                defaultEmail={defaultEmail}
                canceled={canceled}
              />
            </>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
