import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSurveyDetail } from "@/lib/surveys-server";
import { getSurveyHeroImageUrl } from "@/lib/storage";
import { SurveyForm } from "@/components/admin/survey-form";

export default async function EditSurveyPage({ params }: { params: { id: string } }) {
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

  const survey = await getSurveyDetail(params.id);
  if (!survey) notFound();

  if (survey.status !== "draft") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">This survey can&apos;t be edited</h1>
        <p className="text-muted-foreground">
          Only draft surveys can be edited. Use &ldquo;Use as template&rdquo; from the history list to start a new
          survey from this one instead.
        </p>
        <Link href="/admin/surveys" className="text-sm text-primary hover:underline">
          ← Back to Surveys
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin/surveys" className="text-sm text-muted-foreground hover:underline">
          ← Back to Surveys
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit Survey</h1>
        <p className="text-muted-foreground">Draft — not yet sent to anyone.</p>
      </div>
      <SurveyForm
        mode="edit"
        surveyId={survey.id}
        initialValues={{
          title: survey.title,
          description: survey.description ?? "",
          questions: survey.questions,
          audienceMembers: survey.audienceMembers,
          audienceDonors: survey.audienceDonors,
          audienceEventRegistrants: survey.audienceEventRegistrants,
          scheduledStartAt: survey.scheduledStartAt,
          durationDays: survey.durationDays,
          heroImageDisplayUrl: getSurveyHeroImageUrl(survey.heroImageUrl),
        }}
      />
    </main>
  );
}
