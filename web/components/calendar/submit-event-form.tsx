"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
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
import { EventType, EventVisibility } from "@/lib/generated/prisma/enums";
import { EVENT_TYPE_LABELS } from "@/lib/events";
import { createEventSchema, updateEventSchema, type CreateEventValues } from "@/lib/validation/event";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";

const DEFAULT_VALUES: CreateEventValues = {
  title: "",
  description: null,
  type: "" as EventType,
  startsAt: "",
  endsAt: null,
  open: false,
  meetingUrl: null,
  deidentificationConfirmed: false,
  timezone: null,
  visibility: EventVisibility.community,
  invitedUserIds: [],
  meetLinkSource: "auto",
};

/** Converts a stored ISO timestamp to the local "YYYY-MM-DDTHH:mm" value a <input type="datetime-local"> expects. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The three real audiences an event can have (§4.6) — modeled underneath as
// `visibility` (community | invited) crossed with a separate `open`
// boolean, but presented here as one choice so they can't be set into a
// contradictory combination (open + invited is rejected server-side).
type AudienceChoice = "community" | "invited" | "open";

const AUDIENCE_LABELS: Record<AudienceChoice, string> = {
  community: "Community — visible to every member",
  invited: "Restricted — invited members only",
  open: "Open to the public",
};

const AUDIENCE_DESCRIPTIONS: Record<AudienceChoice, string> = {
  community: "Listed on /events, but only members can RSVP.",
  invited:
    "Visible only to you and the invited members below — invisible to everyone else, including the public /events listing.",
  open: "Listed on /events with a \"Register\" action for signed-out visitors, in addition to member RSVP.",
};

type ExistingEvent = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string | null;
  open: boolean;
  meetingUrl: string | null;
  heroImageUrl: string | null;
  deidentificationConfirmed: boolean;
  visibility: EventVisibility;
};

/**
 * "Submit Event" form (§4.6), posted from /calendar/new, and reused from
 * /calendar/[eventId]/edit when `existingEvent` is supplied. The submitting
 * member always becomes the host on create (no host field here — see
 * createEvent's comment in lib/events-server.ts); editing doesn't change
 * the host either. Case Discussion events require the de-identification
 * checkbox — createEventSchema/updateEventSchema both block submission
 * without it. There's no discussion-thread field here at all — a thread is
 * only ever started on demand from the event detail page's "Start a
 * Discussion" button (EventDiscussionLink), for any event, whether it was
 * just created or already exists.
 *
 * Create mode's audience (community / restricted / open) is one Select
 * driving both the underlying `visibility` and `open` fields together
 * (see AudienceChoice/handleAudienceChange below) rather than two separate
 * toggles, so the two can't be set into a contradictory combination in the
 * UI. Visibility itself is create-only — see updateEvent's comment for why
 * only `open` stays editable afterward.
 */
export function SubmitEventForm({
  existingEvent,
  currentUserId,
}: {
  existingEvent?: ExistingEvent;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
} = {}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateEventValues>({
    // Edit mode validates against updateEventSchema, not createEventSchema:
    // createEventSchema's requireRestrictedEventInvariants demands a
    // non-empty invitedUserIds, but that field is intentionally hardcoded to
    // [] and hidden from the UI in edit mode (see defaultValues below) —
    // validating against it here silently blocked every save on a
    // restricted event, since its FormField/FormMessage isn't even rendered
    // to show why.
    resolver: (existingEvent ? zodResolver(updateEventSchema) : zodResolver(createEventSchema)) as Resolver<
      CreateEventValues
    >,
    defaultValues: existingEvent
      ? {
          title: existingEvent.title,
          description: existingEvent.description,
          type: existingEvent.type,
          startsAt: toDatetimeLocalValue(existingEvent.startsAt),
          endsAt: toDatetimeLocalValue(existingEvent.endsAt) || null,
          open: existingEvent.open,
          meetingUrl: existingEvent.meetingUrl,
          deidentificationConfirmed: existingEvent.deidentificationConfirmed,
          timezone: null,
          // The invited list itself isn't editable from this form
          // (Audience-Restricted Group Events — see ManageInvitees on the
          // event detail page for that) but visibility itself needs to be
          // the real value so isRestricted below correctly hides the
          // "Open to the public" toggle etc. for an actually-restricted event.
          visibility: existingEvent.visibility,
          invitedUserIds: [],
          meetLinkSource: "manual",
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const isCaseDiscussion = form.watch("type") === EventType.case_discussion;
  const visibility = form.watch("visibility");
  const isRestricted = visibility === EventVisibility.invited;
  const isOpen = form.watch("open");
  const meetLinkSource = form.watch("meetLinkSource");

  const audience: AudienceChoice = isRestricted ? "invited" : isOpen ? "open" : "community";
  function handleAudienceChange(value: AudienceChoice) {
    form.setValue("visibility", value === "invited" ? EventVisibility.invited : EventVisibility.community, {
      shouldDirty: true,
    });
    form.setValue("open", value === "open", { shouldDirty: true });
  }

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
      // The zone startsAt/endsAt above were actually entered in — stored
      // alongside them so notification/email "when" text can be formatted
      // back into the organizer's wall-clock time instead of the server
      // process's own timezone (see Event.timezone's schema comment).
      formData.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      // "Open to the public" doesn't make sense for a restricted event —
      // same "can't linger as true after switching away" rationale as
      // deidentificationConfirmed below.
      formData.append("open", String(!isRestricted && values.open));
      if (values.meetingUrl) formData.append("meetingUrl", values.meetingUrl);
      // Only relevant (and only enforced) for Case Discussion events — omit
      // for every other type so it can't linger as `true` from switching
      // away from Case Discussion after checking it.
      formData.append(
        "deidentificationConfirmed",
        String(isCaseDiscussion && values.deidentificationConfirmed),
      );
      if (!existingEvent) {
        formData.append("visibility", values.visibility);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
        formData.append("meetLinkSource", values.meetLinkSource);
      }
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
        {!existingEvent && (
          <FormItem className="rounded-md border p-4">
            <FormLabel>Audience</FormLabel>
            <Select value={audience} onValueChange={handleAudienceChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABELS) as AudienceChoice[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {AUDIENCE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>{AUDIENCE_DESCRIPTIONS[audience]}</FormDescription>
          </FormItem>
        )}

        {!existingEvent && isRestricted && (
          <FormField
            control={form.control}
            name="invitedUserIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invited members</FormLabel>
                <FormControl>
                  <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
                </FormControl>
                <FormDescription>
                  Each invited member gets a notification and email asking them to RSVP.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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

        {!existingEvent ? (
          <div className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="meetLinkSource"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-md border p-4">
                  <div>
                    <FormLabel>Auto-generate a Google Meet link</FormLabel>
                    <FormDescription>
                      On by default — creates a Google Meet link automatically. Turn off to paste your own
                      instead.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value === "auto"}
                      onCheckedChange={(checked) => field.onChange(checked ? "auto" : "manual")}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {meetLinkSource === "manual" && (
              <FormField
                control={form.control}
                name="meetingUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meeting link{isRestricted ? "" : " (optional)"}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://meet.google.com/…"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                      />
                    </FormControl>
                    <FormDescription>
                      {isRestricted ? "Shared with invited members." : "Only shown to members who RSVP."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        ) : (
          <FormField
            control={form.control}
            name="meetingUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meeting link{isRestricted ? "" : " (optional)"}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://meet.google.com/…"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormDescription>
                  {isRestricted ? "Shared with invited members." : "Only shown to members who RSVP."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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

        {/* Create mode sets `open` via the Audience selector above.
            Visibility itself can't change after creation (see updateEvent),
            but a community event's `open` flag still can — this is the
            edit-only equivalent of that one setting. */}
        {existingEvent && !isRestricted && (
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
