import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listSurveyHistory } from "@/lib/surveys-server";
import { Button } from "@/components/ui/button";
import { SurveyHistoryTable } from "@/components/admin/survey-history-table";

export default async function AdminSurveysPage() {
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

  const surveys = await listSurveyHistory();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← Back to Admin
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Surveys</h1>
          <p className="text-muted-foreground">
            Compose and send surveys to members, donors, and past event registrants.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/surveys/new">New Survey</Link>
        </Button>
      </div>

      <SurveyHistoryTable surveys={surveys} />
    </main>
  );
}
