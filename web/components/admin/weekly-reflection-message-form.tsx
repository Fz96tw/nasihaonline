"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCsrfToken } from "@/lib/csrf-client";
import { isoWeekStart } from "@/lib/reflection-schedule";
import {
  BODY_PLACEHOLDERS,
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_TITLE_TEMPLATE,
  PLACEHOLDER_HELP,
  TITLE_PLACEHOLDERS,
  buildReflectionValues,
  buildTitleValues,
  renderReflectionTemplate,
} from "@/lib/reflection-template";
import { REFLECTION_BODY_TEMPLATE_MAX, REFLECTION_TITLE_TEMPLATE_MAX, reflectionMessageSchema } from "@/lib/validation/weekly-reflection";
import type { ReflectionQuoteDto } from "@/lib/weekly-reflection-config";

const FALLBACK_SAMPLE = {
  text: "No act of kindness, no matter how small, is ever wasted.",
  author: "Aesop",
  source: null,
  prompt: "Share a small kindness someone showed you that stayed with you.",
};

/**
 * Editor for the wording of each weekly thread. The preview runs the very same
 * pure renderer the poster uses (lib/reflection-template.ts), on the quote that
 * is next in line, so what you see is what members will get. Saving affects
 * future posts only.
 */
export function WeeklyReflectionMessageForm({
  initial,
  sampleQuote,
}: {
  initial: { titleTemplate: string; bodyTemplate: string };
  sampleQuote: ReflectionQuoteDto | null;
}) {
  const router = useRouter();
  const [titleTemplate, setTitleTemplate] = useState(initial.titleTemplate);
  const [bodyTemplate, setBodyTemplate] = useState(initial.bodyTemplate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const sample = sampleQuote ?? FALLBACK_SAMPLE;
  const weekStart = isoWeekStart(new Date());
  const previewTitle = renderReflectionTemplate(titleTemplate, buildTitleValues(sample, weekStart));
  const previewBody = renderReflectionTemplate(bodyTemplate, buildReflectionValues(sample, weekStart));

  const parsed = reflectionMessageSchema.safeParse({ titleTemplate, bodyTemplate });
  const issues = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  const dirty = titleTemplate !== initial.titleTemplate || bodyTemplate !== initial.bodyTemplate;
  const isDefault = titleTemplate === DEFAULT_TITLE_TEMPLATE && bodyTemplate === DEFAULT_BODY_TEMPLATE;

  function insertIntoBody(token: string) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? bodyTemplate.length;
    const end = el?.selectionEnd ?? bodyTemplate.length;
    setBodyTemplate(bodyTemplate.slice(0, start) + token + bodyTemplate.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!parsed.success || !dirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/weekly-reflection/message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't save the message. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>
            The title and text of each weekly thread. Changes apply to future posts only; threads already posted aren&apos;t touched.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="reflection-title-template" className="text-sm font-medium">
              Thread title
            </label>
            <Input id="reflection-title-template" value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              The title is what members see in the feed and forum list. You can use {TITLE_PLACEHOLDERS.map((name) => `{${name}}`).join(" and ")}
              . Try <code>{"“{quote}”"}</code> to show the quote itself as the title.
            </p>
            <p className={`text-right text-xs ${titleTemplate.length > REFLECTION_TITLE_TEMPLATE_MAX ? "text-destructive" : "text-muted-foreground"}`}>
              {titleTemplate.length}/{REFLECTION_TITLE_TEMPLATE_MAX}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reflection-body-template" className="text-sm font-medium">
              Thread message
            </label>
            <Textarea
              id="reflection-body-template"
              ref={bodyRef}
              rows={8}
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Insert:</span>
              {BODY_PLACEHOLDERS.map((name) => (
                <Button key={name} type="button" variant="outline" size="sm" className="font-mono normal-case" title={PLACEHOLDER_HELP[name]} onClick={() => insertIntoBody(`{${name}}`)}>
                  {`{${name}}`}
                </Button>
              ))}
            </div>
            <p className={`text-right text-xs ${bodyTemplate.length > REFLECTION_BODY_TEMPLATE_MAX ? "text-destructive" : "text-muted-foreground"}`}>
              {bodyTemplate.length}/{REFLECTION_BODY_TEMPLATE_MAX}
            </p>
          </div>

          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[auto_1fr] sm:gap-x-4">
            {BODY_PLACEHOLDERS.map((name) => (
              <div key={name} className="contents">
                <dt className="font-mono">{`{${name}}`}</dt>
                <dd>{PLACEHOLDER_HELP[name]}</dd>
              </div>
            ))}
          </dl>

          {issues.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-destructive">
              {issues.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && !dirty && <p className="text-sm text-muted-foreground">Saved. It will be used for the next post.</p>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || !dirty || issues.length > 0}>
              {saving ? "Saving…" : "Save message"}
            </Button>
            <Button
              variant="outline"
              disabled={saving || isDefault}
              onClick={() => {
                setTitleTemplate(DEFAULT_TITLE_TEMPLATE);
                setBodyTemplate(DEFAULT_BODY_TEMPLATE);
                setSaved(false);
              }}
            >
              Reset to default
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Reset fills in the original wording; click Save to apply it.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            {sampleQuote ? "Using the quote that is next in line and this week's date." : "No active quote yet, so this uses a sample quote."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <p className="text-lg font-semibold" data-testid="reflection-preview-title">
              {previewTitle}
            </p>
            <p className="whitespace-pre-wrap text-sm" data-testid="reflection-preview-body">
              {previewBody}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
