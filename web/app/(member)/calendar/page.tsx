import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMemberEvents } from "@/lib/events-server";
import { EVENT_SUBMISSION_TIERS } from "@/lib/events";
import { getPastMeetingsForUser, getUpcomingMeetingsForUser } from "@/lib/meeting-requests-server";
import { getAllCommunities, getOrCreateProfile } from "@/lib/profile-server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { BackToFeedLink } from "@/components/feed/back-to-feed-link";
import { CommunityFilterPillsNav } from "@/components/shared/community-filter-pills-nav";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";
import { isFromFeed } from "@/lib/feed";
import { Button } from "@/components/ui/button";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

export const metadata: Metadata = {
  title: "Calendar — NASIHA",
};

// Calendar-only, independent of /library's own COMMUNITY_FILTER_COOKIE
// (confirmed with user: each page remembers its own last pick rather than
// syncing to one shared value) — same cookie-fallback pattern as
// LIBRARY_SORT_COOKIE.
const COMMUNITY_FILTER_COOKIE = "calendar_community_filter";

/**
 * Community-only filter match, mirroring Peer Review's own
 * matchesCommunityFilter — but with one deliberate addition: an event
 * with zero tagged communities (every pre-existing event, per objective
 * 5's grandfathering) matches "mine" and any specific community pill, same
 * "universal match" rule the original community-based-categorization plan
 * specified for Forum's community-less threads. It does NOT match a bare
 * "other" selection — that tab shows nothing until a specific community
 * pill underneath it is picked (two-level filter, no more unfiltered "All
 * Communities" state), confirmed with user.
 */
function matchesCommunityFilter(
  eventCommunities: { id: string }[],
  selection: CommunityFilterSelection,
  myCommunityIds: string[],
): boolean {
  if (selection === "other") return false;
  if (eventCommunities.length === 0) return true;
  const targetIds = selection === "mine" ? myCommunityIds : [selection];
  return eventCommunities.some((c) => targetIds.includes(c.id));
}

/**
 * Per-pill item counts against the mine-toggle-filtered but community-
 * unfiltered list — same "counts reflect the active tab, not the
 * community-filtered subset" convention as Peer Review's
 * computeCommunityCounts. "other" is informational only (the tab itself
 * shows nothing until a specific pill is picked) — it's every event that
 * doesn't already match "mine", i.e. what picking each "other" pill in
 * turn would reveal, combined.
 */
function computeCommunityCounts(
  events: { communities: { id: string }[] }[],
  communities: { id: string }[],
  myCommunityIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const mineMatches = events.filter((event) => matchesCommunityFilter(event.communities, "mine", myCommunityIds));
  counts.set("mine", mineMatches.length);
  counts.set("other", events.length - mineMatches.length);
  for (const community of communities) {
    counts.set(
      community.id,
      events.filter((event) => matchesCommunityFilter(event.communities, community.id, myCommunityIds)).length,
    );
  }
  return counts;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { ref?: string; mine?: string; community?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [allEvents, meetings, pastMeetings, profile, communities] = await Promise.all([
    getMemberEvents(user.id),
    getUpcomingMeetingsForUser(user.id),
    getPastMeetingsForUser(user.id),
    getOrCreateProfile(user.id),
    getAllCommunities(),
  ]);
  const canSubmitEvent = Boolean(user.tier && EVENT_SUBMISSION_TIERS.includes(user.tier));
  const mine = searchParams.mine === "1";
  const mineFilteredEvents = mine ? allEvents.filter((event) => event.hostId === user.id) : allEvents;

  const myCommunityIds = profile.communities.map((c) => c.community.id);
  const requestedCommunity = searchParams.community ?? cookies().get(COMMUNITY_FILTER_COOKIE)?.value;
  const explicitCommunity = communities.find((c) => c.slug === requestedCommunity);
  const isOtherCommunities = requestedCommunity === "other";
  const selectedCommunity: CommunityFilterSelection = isOtherCommunities
    ? "other"
    : explicitCommunity
      ? explicitCommunity.id
      : "mine";
  const events = mineFilteredEvents.filter((event) =>
    matchesCommunityFilter(event.communities, selectedCommunity, myCommunityIds),
  );
  const communityCounts = computeCommunityCounts(mineFilteredEvents, communities, myCommunityIds);

  const mineHref = (() => {
    const qs = new URLSearchParams();
    if (searchParams.ref) qs.set("ref", searchParams.ref);
    if (searchParams.community) qs.set("community", searchParams.community);
    if (!mine) qs.set("mine", "1");
    const query = qs.toString();
    return `/calendar${query ? `?${query}` : ""}`;
  })();

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/calendar.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Calendar</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Upcoming webinars, workshops, and roundtables — including members-only sessions.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-16">
        <BackToFeedLink searchParams={searchParams} />

        <div className="flex justify-end gap-2">
          <Button asChild variant={mine ? "secondary" : "outline"}>
            <Link href={mineHref} scroll={false}>
              My Events
            </Link>
          </Button>
          {canSubmitEvent && (
            <Button asChild>
              <Link href="/calendar/new">Create Event</Link>
            </Button>
          )}
        </div>

        <CommunityFilterPillsNav
          communities={communities}
          myCommunityIds={myCommunityIds}
          followsAllCommunities={profile.followsAllCommunities}
          selected={selectedCommunity}
          counts={communityCounts}
          cookieName={COMMUNITY_FILTER_COOKIE}
          buildHref={(selection) => {
            const params = new URLSearchParams();
            if (searchParams.ref) params.set("ref", searchParams.ref);
            if (mine) params.set("mine", "1");
            if (selection === "other") {
              params.set("community", "other");
            } else if (selection !== "mine") {
              const slug = communities.find((c) => c.id === selection)?.slug;
              if (slug) params.set("community", slug);
            }
            // selection === "mine" sets no community param — that's the implicit default.
            const qs = params.toString();
            return qs ? `/calendar?${qs}` : "/calendar";
          }}
        />

        <CalendarView
          events={events}
          meetings={meetings}
          pastMeetings={pastMeetings}
          currentUserId={user.id}
          forcedTab={isFromFeed(searchParams) ? "list" : undefined}
        />
      </section>
    </main>
  );
}
