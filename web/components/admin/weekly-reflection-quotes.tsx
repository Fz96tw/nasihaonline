"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCsrfToken } from "@/lib/csrf-client";
import {
  REFLECTION_AUTHOR_MAX,
  REFLECTION_PROMPT_MAX,
  REFLECTION_QUOTE_TEXT_MAX,
  REFLECTION_SOURCE_MAX,
  reflectionQuoteFieldsSchema,
} from "@/lib/validation/weekly-reflection";
import type { ReflectionQuoteDto } from "@/lib/weekly-reflection-config";

type FormState = { text: string; author: string; source: string; prompt: string };
const EMPTY: FormState = { text: "", author: "", source: "", prompt: "" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The quote pool: used/unused state, add, edit, and retire/reactivate (never delete, so posting history stays intact). */
export function WeeklyReflectionQuotes({ quotes }: { quotes: ReflectionQuoteDto[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; quote: ReflectionQuoteDto } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function openAdd() {
    setForm(EMPTY);
    setFieldErrors({});
    setFormError(null);
    setDialog({ mode: "add" });
  }

  function openEdit(quote: ReflectionQuoteDto) {
    setForm({ text: quote.text, author: quote.author, source: quote.source ?? "", prompt: quote.prompt });
    setFieldErrors({});
    setFormError(null);
    setDialog({ mode: "edit", quote });
  }

  async function submit() {
    if (!dialog) return;
    const parsed = reflectionQuoteFieldsSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    setFormError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(
        dialog.mode === "add" ? "/api/admin/weekly-reflection/quotes" : `/api/admin/weekly-reflection/quotes/${dialog.quote.id}`,
        {
          method: dialog.mode === "add" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify(parsed.data),
        },
      );
      if (res.status === 409) {
        setFormError("That quote is already in the pool.");
        return;
      }
      if (!res.ok) throw new Error();
      setDialog(null);
      router.refresh();
    } catch {
      setFormError("Couldn't save the quote. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(quote: ReflectionQuoteDto, active: boolean) {
    setTogglingId(quote.id);
    setListError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/weekly-reflection/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setListError("Couldn't update that quote. Please try again.");
    } finally {
      setTogglingId(null);
    }
  }

  const activeCount = quotes.filter((quote) => quote.active).length;

  function field(name: keyof FormState, label: string, max: number, multiline = false) {
    const common = {
      id: `reflection-${name}`,
      value: form[name],
      maxLength: max + 50, // allow typing past the limit so the validation message is reachable
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [name]: e.target.value })),
      "aria-invalid": fieldErrors[name] ? true : undefined,
    };
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={common.id} className="text-sm font-medium">
          {label}
        </label>
        {multiline ? <Textarea {...common} rows={3} /> : <Input {...common} />}
        <div className="flex justify-between text-xs">
          <span className="text-destructive">{fieldErrors[name]}</span>
          <span className={form[name].length > max ? "text-destructive" : "text-muted-foreground"}>
            {form[name].length}/{max}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote pool</CardTitle>
        <CardDescription>
          {activeCount} active of {quotes.length}. Quotes rotate oldest-posted first and never repeat until every active quote has been used.
          Retire a quote to take it out of rotation without losing its history.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button onClick={openAdd}>Add quote</Button>
        </div>
        {listError && <p className="text-sm text-destructive">{listError}</p>}
        <ul className="flex flex-col divide-y rounded-md border">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <p className={quote.active ? "" : "text-muted-foreground line-through"}>&ldquo;{quote.text}&rdquo;</p>
                <p className="text-sm text-muted-foreground">
                  &mdash; {quote.author}
                  {quote.source ? `, ${quote.source}` : ""}
                </p>
                <p className="text-sm">{quote.prompt}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant={quote.active ? "success" : "neutral"}>{quote.active ? "Active" : "Retired"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {quote.timesPosted > 0
                      ? `Used ${quote.timesPosted}×, last ${quote.lastPostedAt ? formatDate(quote.lastPostedAt) : ""}`
                      : "Not used yet"}
                  </span>
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(quote)}>
                  Edit
                </Button>
                <Button variant="outline" size="sm" disabled={togglingId === quote.id} onClick={() => setActive(quote, !quote.active)}>
                  {quote.active ? "Retire" : "Reactivate"}
                </Button>
              </div>
            </li>
          ))}
          {quotes.length === 0 && <li className="p-4 text-sm text-muted-foreground">No quotes yet.</li>}
        </ul>
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "Edit quote" : "Add quote"}</DialogTitle>
            <DialogDescription>Shown to members as a thread: the quote, its attribution, then the prompt.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {field("text", "Quote", REFLECTION_QUOTE_TEXT_MAX, true)}
            {field("author", "Author", REFLECTION_AUTHOR_MAX)}
            {field("source", "Source (optional)", REFLECTION_SOURCE_MAX)}
            {field("prompt", "Reflection prompt", REFLECTION_PROMPT_MAX, true)}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
