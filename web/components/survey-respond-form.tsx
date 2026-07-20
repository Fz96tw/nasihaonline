"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { getCsrfToken } from "@/lib/csrf-client";
import type { InvitationForResponse } from "@/lib/surveys-server";

const RATING_VALUES = ["1", "2", "3", "4", "5"];

/**
 * Public survey response form — reached via a tokenized magic link, no
 * session required (the token is the credential, see
 * app/api/surveys/respond/[token]/route.ts). Answers are plain
 * `Record<questionId, string[]>` state rather than react-hook-form, since
 * the field set is fully dynamic (unknown at compile time) and there's no
 * schema-driven form here — just per-type input rendering.
 */
export function SurveyRespondForm({
  token,
  survey,
}: {
  token: string;
  survey: InvitationForResponse;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function setSingleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: [value] }));
  }

  function toggleMultiAnswer(questionId: string, option: string, checked: boolean) {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      const next = checked ? [...current, option] : current.filter((value) => value !== option);
      return { ...prev, [questionId]: next };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const question of survey.questions) {
      if (question.required && (answers[question.id] ?? []).filter(Boolean).length === 0) {
        setError(`"${question.prompt}" is required.`);
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/surveys/respond/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-[10px] border p-6 text-center">
        <h2 className="text-xl font-semibold">Thank you!</h2>
        <p className="mt-1 text-muted-foreground">Your response has been recorded.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {survey.questions.map((question) => (
        <div key={question.id} className="flex flex-col gap-2">
          <label className="font-medium">
            {question.prompt}
            {question.required && <span className="text-destructive"> *</span>}
          </label>

          {question.type === "short_text" && (
            <Input
              value={answers[question.id]?.[0] ?? ""}
              onChange={(e) => setSingleAnswer(question.id, e.target.value)}
            />
          )}

          {question.type === "long_text" && (
            <Textarea
              rows={4}
              value={answers[question.id]?.[0] ?? ""}
              onChange={(e) => setSingleAnswer(question.id, e.target.value)}
            />
          )}

          {question.type === "single_choice" && (
            <div className="flex flex-col gap-1">
              {question.options.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={answers[question.id]?.[0] === option}
                    onChange={() => setSingleAnswer(question.id, option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          )}

          {question.type === "multi_choice" && (
            <div className="flex flex-col gap-1">
              {question.options.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={(answers[question.id] ?? []).includes(option)}
                    onCheckedChange={(checked) => toggleMultiAnswer(question.id, option, Boolean(checked))}
                  />
                  {option}
                </label>
              ))}
            </div>
          )}

          {question.type === "yes_no" && (
            <div className="flex gap-4">
              {["Yes", "No"].map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={answers[question.id]?.[0] === option}
                    onChange={() => setSingleAnswer(question.id, option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          )}

          {question.type === "rating" && (
            <div className="flex gap-2">
              {RATING_VALUES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={answers[question.id]?.[0] === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSingleAnswer(question.id, value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
