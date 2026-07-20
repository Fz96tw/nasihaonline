import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSurveyResponses } from "@/lib/surveys-server";
import { Button } from "@/components/ui/button";
import { SurveyResponseViewer } from "@/components/admin/survey-response-viewer";

export default async function SurveyResponsesPage({ params }: { params: { id: string } }) {
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

  const data = await getSurveyResponses(params.id);
  if (!data) notFound();

  const respondedCount = data.rows.length;
  const pendingCount = Math.max(0, data.survey.sentCount - respondedCount);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/surveys" className="text-sm text-muted-foreground hover:underline">
            ← Back to Surveys
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{data.survey.title}</h1>
          <p className="text-muted-foreground">
            {data.survey.sentCount} sent · {respondedCount} responded · {pendingCount} pending
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/admin/surveys/${params.id}/recipients`}>Recipients</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/admin/surveys/${params.id}/responses?export=csv`}>Export CSV</a>
          </Button>
        </div>
      </div>

      <SurveyResponseViewer data={data} />
    </main>
  );
}
