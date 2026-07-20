import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMemberInvitationToken } from "@/lib/surveys-server";
import { isFromFeed, withFeedRef } from "@/lib/feed";

/**
 * Member-facing feed click-through (lib/feed-server.ts's survey feed item
 * links here, not straight to a token URL, since the feed is
 * session-gated already). Not in middleware's isProtectedPageRoute list —
 * checked in-page instead, same as the admin pages — because that list is
 * prefix-matched and /surveys/respond/[token] (a sibling path, public) must
 * stay reachable without a session.
 *
 * Forwards the feed's ?ref=whats-new marker onto the redirect target so
 * /surveys/respond/[token] can still show a "back to feed" link — a plain
 * redirect() would otherwise drop the query param, and the token page has
 * no other way to know this visit came from the feed vs. an emailed link.
 */
export default async function MemberSurveyPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const token = await getMemberInvitationToken(params.id, user.id);
  if (!token) notFound();

  const target = `/surveys/respond/${token}`;
  redirect(isFromFeed(searchParams) ? withFeedRef(target) : target);
}
