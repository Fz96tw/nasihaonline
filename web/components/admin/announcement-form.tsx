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
import { createAnnouncementSchema, type CreateAnnouncementValues } from "@/lib/validation/announcement";
import { getCsrfToken } from "@/lib/csrf-client";

const DEFAULT_VALUES: CreateAnnouncementValues = {
  title: "",
  body: "",
  showInFeed: true,
  notifyInApp: true,
  sendEmail: true,
};

type TemplateAnnouncement = {
  sourceId: string;
  title: string;
  body: string;
  heroImageDisplayUrl: string | null;
};

/**
 * "Compose Announcement" form (§4.10), posted from /admin/announcements/new.
 * Multipart rather than JSON since the optional cover image travels
 * alongside title/body in one request — same pattern as WritePostForm.
 * Sending is immediate on submit (no separate draft-save step): the Board
 * Announcement broadcasts to every member and can't be un-sent, so this
 * shows a confirm before firing.
 *
 * `templateAnnouncement` supports "use as template" resends from a past
 * (live or retracted) announcement (?fromId=<id>): pre-fills title/body/cover
 * image but always submits as a brand-new Announcement — same `existingPost`
 * prop pattern WritePostForm uses for edit mode, except this always POSTs
 * (never PATCHes) since the source's history entry must stay untouched.
 */
export function AnnouncementForm({ templateAnnouncement }: { templateAnnouncement?: TemplateAnnouncement }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateAnnouncementValues>({
    resolver: zodResolver(createAnnouncementSchema),
    defaultValues: templateAnnouncement
      ? { ...DEFAULT_VALUES, title: templateAnnouncement.title, body: templateAnnouncement.body }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const channelValues = form.watch(["showInFeed", "notifyInApp", "sendEmail"]);
  const checkedChannelCount = channelValues.filter(Boolean).length;

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
      formData.append("showInFeed", String(values.showInFeed));
      formData.append("notifyInApp", String(values.notifyInApp));
      formData.append("sendEmail", String(values.sendEmail));
      if (heroImage) formData.append("heroImage", heroImage);
      if (templateAnnouncement) formData.append("fromId", templateAnnouncement.sourceId);

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
          {templateAnnouncement?.heroImageDisplayUrl && !heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={templateAnnouncement.heroImageDisplayUrl}
              alt="Current cover image"
              className="h-32 w-full max-w-xs rounded-md object-cover"
            />
          )}
          <input
            id="hero-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          />
          {templateAnnouncement?.heroImageDisplayUrl && (
            <p className="text-xs text-muted-foreground">Choose a new file to replace it.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Deliver via</span>
          <FormField
            control={form.control}
            name="showInFeed"
            render={({ field }) => (
              <FormItem>
                <label className="flex items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={field.value && checkedChannelCount <= 1}
                    />
                  </FormControl>
                  <span>Post to feed (What&rsquo;s New)</span>
                </label>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notifyInApp"
            render={({ field }) => (
              <FormItem>
                <label className="flex items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={field.value && checkedChannelCount <= 1}
                    />
                  </FormControl>
                  <span>Send bell notification</span>
                </label>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sendEmail"
            render={({ field }) => (
              <FormItem>
                <label className="flex items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={field.value && checkedChannelCount <= 1}
                    />
                  </FormControl>
                  <span>Send email</span>
                </label>
              </FormItem>
            )}
          />
          {form.formState.errors.showInFeed && (
            <p className="text-sm text-destructive">{form.formState.errors.showInFeed.message}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Sent as &ldquo;NASIHA Board&rdquo; via the channels selected above, regardless of
          recipients&rsquo; notification preferences. Reserve this for infrequent, high-signal
          updates.
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
