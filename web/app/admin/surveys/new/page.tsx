import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSurveyDetail } from "@/lib/surveys-server";
import { getSurveyHeroImageUrl } from "@/lib/storage";
import { SurveyForm, type SurveyFormInitialValues } from "@/components/admin/survey-form";

export default async function NewSurveyPage({ searchParams }: { searchParams: { fromId?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const { fromId } = searchParams;
  let initialValues: SurveyFormInitialValues | undefined;
  if (fromId) {
    const template = await getSurveyDetail(fromId);
    if (template) {
      initialValues = {
        title: template.title,
        description: template.description ?? "",
        questions: template.questions,
        audienceMembers: template.audienceMembers,
        audienceDonors: template.audienceDonors,
        audienceEventRegistrants: template.audienceEventRegistrants,
        // A template never carries over the source's schedule — a resend is
        // a fresh send, not a copy of when the original went out.
        scheduledStartAt: null,
        durationDays: template.durationDays,
        heroImageDisplayUrl: getSurveyHeroImageUrl(template.heroImageUrl),
      };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin/surveys" className="text-sm text-muted-foreground hover:underline">
          ← Back to Surveys
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New Survey</h1>
        <p className="text-muted-foreground">
          Build your question set, pick an audience, and save as a draft or send right away.
        </p>
      </div>
      <SurveyForm mode="create" templateSourceId={initialValues ? fromId : undefined} initialValues={initialValues} />
    </main>
  );
}
