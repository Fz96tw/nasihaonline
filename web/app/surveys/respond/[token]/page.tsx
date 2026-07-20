import { notFound } from "next/navigation";
import { getInvitationByToken } from "@/lib/surveys-server";
import { SurveyRespondForm } from "@/components/survey-respond-form";
import { BackToFeedLink } from "@/components/feed/back-to-feed-link";

/**
 * Public respond page — no session required, reached via either the
 * emailed magic link (?token only) or, for members, a click-through from
 * the What's New feed via /surveys/[id] (which forwards ?ref=whats-new
 * here). Not in middleware's isProtectedPageRoute list, so unauthenticated
 * visitors (donors, event guests) can load it directly. BackToFeedLink only
 * renders when that marker is present, so an emailed-link visitor — who has
 * no session and nothing to "go back" to — never sees it.
 */
export default async function SurveyRespondPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { ref?: string };
}) {
  const invitation = await getInvitationByToken(params.token);
  if (!invitation) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <BackToFeedLink searchParams={searchParams} />
      <div>
        {invitation.surveyHeroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
          <img
            src={invitation.surveyHeroImageUrl}
            alt=""
            className="mb-4 max-h-64 w-full rounded-md object-cover"
          />
        )}
        <h1 className="text-3xl font-bold tracking-tight">{invitation.surveyTitle}</h1>
        {invitation.surveyDescription && (
          <p className="mt-2 text-muted-foreground">{invitation.surveyDescription}</p>
        )}
      </div>

      {invitation.alreadyResponded ? (
        <div className="rounded-[10px] border p-6 text-center">
          <h2 className="text-xl font-semibold">You&apos;ve already responded</h2>
          <p className="mt-1 text-muted-foreground">Thanks for taking the time to share your feedback.</p>
        </div>
      ) : invitation.surveyStatus !== "open" ? (
        <div className="rounded-[10px] border p-6 text-center">
          <h2 className="text-xl font-semibold">This survey isn&apos;t open right now</h2>
          <p className="mt-1 text-muted-foreground">
            {invitation.surveyStatus === "closed"
              ? "This survey has been closed."
              : "This survey hasn't opened yet."}
          </p>
        </div>
      ) : (
        <SurveyRespondForm token={params.token} survey={invitation} />
      )}
    </main>
  );
}
