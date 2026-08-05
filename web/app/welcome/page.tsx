import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { DIRECTORY_TIER_LABELS } from "@/lib/members";
import { Tier } from "@/lib/generated/prisma/enums";

const STARTS_WITH_VOWEL_SOUND = new Set<Tier>([Tier.active, Tier.associate]);

/**
 * One-time landing point for a brand-new member's first sign-in (§4.3,
 * §4.10's welcome shout-out neighbor). Since /join now only collects
 * identity-minimum fields (§3.1), this is where the Board's approval is
 * actually acknowledged to the member, before the (member) layout's
 * onboarding gate (see getMissingRequiredProfileFields in
 * lib/profile-server.ts) sends them on to /profile to fill in the rest.
 * Deliberately outside the (member) route group — no sidebar chrome, same
 * "give them somewhere clean to land" precedent as /account-suspended.
 */
export default async function WelcomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome to NASIHA{user.name ? `, ${user.name}` : ""}!
      </h1>
      <p className="max-w-md text-muted-foreground">
        Thank you for joining
        {user.tier
          ? ` as a${STARTS_WITH_VOWEL_SOUND.has(user.tier) ? "n" : ""} ${DIRECTORY_TIER_LABELS[user.tier]}`
          : ""}
        ! Your application only asked for the basics, so before you dive in, let&rsquo;s
        finish setting up your profile — career stage, expertise, and what you&rsquo;re
        hoping to learn — so other members can find and connect with you.
      </p>
      <Button asChild size="lg">
        <Link href="/profile">Complete your profile</Link>
      </Button>
    </main>
  );
}
