"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createForumThreadSchema, type CreateForumThreadValues } from "@/lib/validation/forum";
import { getCsrfToken } from "@/lib/csrf-client";

const DEFAULT_VALUES: CreateForumThreadValues = {
  title: "",
  body: "",
  deidentificationConfirmed: false,
};

/**
 * "New Thread" form (§4.13), posted from /forums/[category]/new. The
 * de-identification checkbox only renders (and is only required) when
 * requireDeidentification is set — driven by the forum being Clinical
 * Discussions, same conditional-gate shape as SubmitResourceForm's
 * case_study checkbox. Both gates are enforced again server-side by
 * createForumThread.
 */
export function NewThreadForm({
  forumId,
  forumSlug,
  requireDeidentification,
}: {
  forumId: string;
  forumSlug: string;
  requireDeidentification: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateForumThreadValues>({
    resolver: zodResolver(createForumThreadSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  async function onSubmit(values: CreateForumThreadValues) {
    if (requireDeidentification && !values.deidentificationConfirmed) {
      form.setError("deidentificationConfirmed", {
        message: "You must confirm all patient information has been de-identified.",
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/${forumId}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : payload?.error
              ? JSON.stringify(payload.error)
              : "Something went wrong. Please try again.",
        );
      }
      const { id } = await res.json();
      router.push(`/forums/${forumSlug}/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Approach to refractory hypertension" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Post</FormLabel>
              <FormControl>
                <Textarea rows={6} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {requireDeidentification && (
          <FormField
            control={form.control}
            name="deidentificationConfirmed"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="!mt-0">I confirm all patient information has been de-identified</FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Posting…" : "Start Thread"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
