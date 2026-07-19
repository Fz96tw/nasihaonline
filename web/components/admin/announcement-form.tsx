"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createAnnouncementSchema, type CreateAnnouncementValues } from "@/lib/validation/announcement";
import { getCsrfToken } from "@/lib/csrf-client";

const DEFAULT_VALUES: CreateAnnouncementValues = { title: "", body: "" };

/**
 * "Compose Announcement" form (§4.10), posted from /admin/announcements/new.
 * Multipart rather than JSON since the optional cover image travels
 * alongside title/body in one request — same pattern as WritePostForm.
 * Sending is immediate on submit (no separate draft-save step): the Board
 * Announcement broadcasts to every member and can't be un-sent, so this
 * shows a confirm before firing.
 */
export function AnnouncementForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateAnnouncementValues>({
    resolver: zodResolver(createAnnouncementSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  async function onSubmit(values: CreateAnnouncementValues) {
    if (
      !window.confirm(
        "Send this announcement to every member now? This can't be undone or un-sent.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("title", values.title);
      formData.append("body", values.body);
      if (heroImage) formData.append("heroImage", heroImage);

      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: formData,
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
      router.push("/admin/announcements");
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
                <Input placeholder="e.g. Annual Gala — Save the Date" {...field} />
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
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea rows={10} placeholder="Write the announcement…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="hero-image" className="text-sm font-medium">
            Cover image (optional)
          </label>
          <input
            id="hero-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Sent as &ldquo;NASIHA Board&rdquo; to every member, in-app and by email, regardless of
          their notification preferences. Reserve this for infrequent, high-signal updates.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send Announcement"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
