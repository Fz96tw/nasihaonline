"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { EventType } from "@/lib/generated/prisma/enums";
import { EVENT_TYPE_LABELS } from "@/lib/events";
import { createEventSchema, type CreateEventValues } from "@/lib/validation/event";
import { getCsrfToken } from "@/lib/csrf-client";

const DEFAULT_VALUES: CreateEventValues = {
  title: "",
  description: null,
  type: "" as EventType,
  startsAt: "",
  endsAt: null,
  open: false,
  icon: null,
  meetingUrl: null,
  deidentificationConfirmed: false,
  createDiscussionThread: false,
};

/** Converts a stored ISO timestamp to the local "YYYY-MM-DDTHH:mm" value a <input type="datetime-local"> expects. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ExistingEvent = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string | null;
  open: boolean;
  icon: string | null;
  meetingUrl: string | null;
  heroImageUrl: string | null;
  deidentificationConfirmed: boolean;
};

/**
 * "Submit Event" form (§4.6), posted from /calendar/new, and reused from
 * /calendar/[eventId]/edit when `existingEvent` is supplied. The submitting
 * member always becomes the host on create (no host field here — see
 * createEvent's comment in lib/events-server.ts); editing doesn't change
 * the host either. Case Discussion events require the de-identification
 * checkbox — createEventSchema/updateEventSchema both block submission
 * without it. createDiscussionThread is create-only (omitted entirely, and
 * from updateEventSchema, when editing) — same "one-time action" rationale
 * as WritePostForm's licenseConsented.
 */
export function SubmitEventForm({ existingEvent }: { existingEvent?: ExistingEvent } = {}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateEventValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: existingEvent
      ? {
          title: existingEvent.title,
          description: existingEvent.description,
          type: existingEvent.type,
          startsAt: toDatetimeLocalValue(existingEvent.startsAt),
          endsAt: toDatetimeLocalValue(existingEvent.endsAt) || null,
          open: existingEvent.open,
          icon: existingEvent.icon,
          meetingUrl: existingEvent.meetingUrl,
          deidentificationConfirmed: existingEvent.deidentificationConfirmed,
          createDiscussionThread: false,
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const isCaseDiscussion = form.watch("type") === EventType.case_discussion;

  async function onSubmit(values: CreateEventValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("title", values.title);
      if (values.description) formData.append("description", values.description);
      formData.append("type", values.type);
      // datetime-local values are converted to real ISO instants here, in
      // the browser's own timezone — parsing the raw string server-side
      // would use the server's timezone instead (§4.6 requires UTC
      // storage), same conversion as RequestMeetingDialog's proposedTimes.
      formData.append("startsAt", new Date(values.startsAt).toISOString());
      if (values.endsAt) formData.append("endsAt", new Date(values.endsAt).toISOString());
      formData.append("open", String(values.open));
      if (values.icon) formData.append("icon", values.icon);
      if (values.meetingUrl) formData.append("meetingUrl", values.meetingUrl);
      // Only relevant (and only enforced) for Case Discussion events — omit
      // for every other type so it can't linger as `true` from switching
      // away from Case Discussion after checking it.
      formData.append(
        "deidentificationConfirmed",
        String(isCaseDiscussion && values.deidentificationConfirmed),
      );
      if (!existingEvent) formData.append("createDiscussionThread", String(values.createDiscussionThread));
      if (heroImage) formData.append("heroImage", heroImage);

      const res = await fetch(existingEvent ? `/api/events/${existingEvent.id}` : "/api/events", {
        method: existingEvent ? "PATCH" : "POST",
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
      const { id } = await res.json();
      router.push(existingEvent ? `/calendar/${id}` : "/calendar");
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
                <Input placeholder="e.g. Cardiology Update 2026" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(EventType).map((value) => (
                    <SelectItem key={value} value={value}>
                      {EVENT_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Icon (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. 🫀"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="meetingUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meeting link (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://meet.google.com/…"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormDescription>Only shown to members who RSVP.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="hero-image" className="text-sm font-medium">
            Hero image (optional)
          </label>
          {existingEvent?.heroImageUrl && !heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={existingEvent.heroImageUrl}
              alt="Current hero image"
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
          {existingEvent?.heroImageUrl && (
            <p className="text-xs text-muted-foreground">Choose a new file to replace the current image.</p>
          )}
        </div>

        <FormField
          control={form.control}
          name="open"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-4">
              <div>
                <FormLabel>Open to the public</FormLabel>
                <FormDescription>
                  Off keeps this event members-only; listed on /events either way.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {!existingEvent && (
          <FormField
            control={form.control}
            name="createDiscussionThread"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="!mt-0">Create a discussion thread for this event</FormLabel>
                  <FormDescription>
                    Posts a linked thread in the Events forum, titled after this event, with a first post
                    linking back to it.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        {isCaseDiscussion && (
          <FormField
            control={form.control}
            name="deidentificationConfirmed"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="!mt-0">
                    I confirm no identifiable patient information will be shared
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : existingEvent ? "Save Changes" : "Submit Event"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
