import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOpenSurveysForDashboard } from "@/lib/surveys-server";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function ActiveSurveyWidget() {
  const surveys = await getOpenSurveysForDashboard();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Active Surveys</CardTitle>
      </CardHeader>
      <CardContent>
        {surveys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open surveys right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {surveys.map((survey) => (
              <li key={survey.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <Link
                  href={`/surveys/${survey.id}?ref=dashboard`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {survey.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Opened {formatDate(survey.openedAt)}
                  {survey.closesAt ? ` · Closes ${formatDate(survey.closesAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
