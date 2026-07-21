import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMemberInvitationToken } from "@/lib/surveys-server";

/**
 * Member-facing click-through, reached from either the What's New feed
 * (lib/feed-server.ts) or the dashboard's Active Surveys widget — not
 * straight to a token URL, since both are session-gated already. Not in
 * middleware's isProtectedPageRoute list — checked in-page instead, same as
 * the admin pages — because that list is prefix-matched and
 * /surveys/respond/[token] (a sibling path, public) must stay reachable
 * without a session.
 *
 * Forwards whatever ?ref=<source> marker it was reached with onto the
 * redirect target so /surveys/respond/[token] can still show a "back to
 * feed"/"back to dashboard" link — a plain redirect() would otherwise drop
 * the query param, and the token page has no other way to know which
 * surface this visit came from (or an emailed link, which carries no ref).
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

  const ref = typeof searchParams.ref === "string" ? searchParams.ref : null;
  const target = `/surveys/respond/${token}`;
  redirect(ref ? `${target}?ref=${ref}` : target);
}
