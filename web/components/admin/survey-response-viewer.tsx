import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format-date";
import type { SurveyResponsesData } from "@/lib/surveys-server";

const TEXT_TYPES = new Set(["short_text", "long_text"]);

/**
 * Per-question aggregates (frequency breakdown for choice/rating/yes-no
 * questions, a raw list for free text) plus the full per-respondent table.
 * Read-only — CSV export is a plain link to the same route with
 * ?export=csv, no client JS needed (same pattern as the donations page).
 */
export function SurveyResponseViewer({ data }: { data: SurveyResponsesData }) {
  const { questions, rows } = data;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {questions.map((question) => {
          const values = rows.flatMap((row) => row.answers[question.id] ?? []);
          const isText = TEXT_TYPES.has(question.type);

          const counts = new Map<string, number>();
          if (!isText) {
            for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
          }

          return (
            <div key={question.id} className="rounded-[10px] border p-4">
              <p className="font-medium">{question.prompt}</p>
              <p className="mb-2 text-xs text-muted-foreground">{values.length} answer(s)</p>
              {isText ? (
                values.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No answers yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {values.map((value, index) => (
                      <li key={index} className="rounded bg-muted px-2 py-1">
                        {value}
                      </li>
                    ))}
                  </ul>
                )
              ) : counts.size === 0 ? (
                <p className="text-sm text-muted-foreground">No answers yet.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {Array.from(counts.entries()).map(([value, count]) => (
                    <li key={value} className="flex items-center justify-between gap-2">
                      <span>{value}</span>
                      <Badge variant="neutral">{count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Submitted</TableHead>
              {questions.map((question) => (
                <TableHead key={question.id}>{question.prompt}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3 + questions.length} className="text-center text-muted-foreground">
                  No responses yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, index) => (
              <TableRow key={index}>
                <TableCell>{row.respondentName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.respondentEmail}</TableCell>
                <TableCell className="text-muted-foreground">{formatTimestamp(row.submittedAt)}</TableCell>
                {questions.map((question) => (
                  <TableCell key={question.id}>{(row.answers[question.id] ?? []).join("; ") || "—"}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
