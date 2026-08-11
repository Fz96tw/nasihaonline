import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMySubmissions, getSharedWithMe, getSeekingReviewersFeed } from "@/lib/review-server";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Button } from "@/components/ui/button";
import { ReviewDashboardTabs } from "@/components/review/review-dashboard-tabs";

export const metadata: Metadata = {
  title: "Peer Review & Feedback — NASIHA",
};

/**
 * /review-feedback — the Peer Review & Feedback dashboard. Hero matches the
 * Knowledge Library's own top-level page (this is the section's main
 * landing page, not a nested utility view), same /images/feedback.jpg
 * already used for this activity on the landing/get-involved tiles.
 */
export default async function ReviewFeedbackPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [mySubmissions, sharedWithMe, seekingReviewers] = await Promise.all([
    getMySubmissions(user.id),
    getSharedWithMe(user.id),
    getSeekingReviewersFeed(user.id),
  ]);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/feedback.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">
            Peer Review &amp; Feedback
          </h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Share your work with a hand-picked group of peers, or review what others have shared with you.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 py-16">
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/review-feedback/new">Submit an Item</Link>
          </Button>
        </div>

        <ReviewDashboardTabs
          mySubmissions={mySubmissions}
          sharedWithMe={sharedWithMe}
          seekingReviewers={seekingReviewers}
          currentUserId={user.id}
        />
      </section>
    </main>
  );
}
