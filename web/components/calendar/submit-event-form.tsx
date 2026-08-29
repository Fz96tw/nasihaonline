"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EventType, EventVisibility, RecurrenceFrequency } from "@/lib/generated/prisma/enums";
import { EVENT_TYPE_LABELS, type EventCategoryOption, type EventCommunityOption } from "@/lib/events";
import { createEventSchema, updateEventSchema, type CreateEventValues } from "@/lib/validation/event";
import { DATETIME_LOCAL_STEP_SECONDS, snapDatetimeLocalValue } from "@/lib/datetime-input";
import { describeRecurrence } from "@/lib/recurrence";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";

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
  coHostUserIds: [],
  communityIds: [],
  categoryIds: [],
  meetLinkSource: "livekit",
  recurrence: null,
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toggleWeekday(byWeekday: number[], day: number): number[] {
  return byWeekday.includes(day) ? byWeekday.filter((d) => d !== day) : [...byWeekday, day].sort((a, b) => a - b);
}

/** Default "Repeat until" when the checkbox is first turned on: 90 days after the event's start (or from now, if the start field isn't filled in yet). */
function defaultUntilIso(startsAtLocal: string): string {
  const start = startsAtLocal ? new Date(startsAtLocal) : new Date();
  const anchor = Number.isNaN(start.getTime()) ? new Date() : start;
  return new Date(anchor.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

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
  meetLinkSource: "auto" | "manual" | "livekit";
  heroImageUrl: string | null;
  deidentificationConfirmed: boolean;
  visibility: EventVisibility;
  /** Community-based-categorization initiative, objective 5 — unlike invitedUserIds/coHostUserIds below, genuinely editable here, so this reflects the event's real current tags rather than being hardcoded empty. */
  communityIds: string[];
  categoryIds: string[];
  meetingOrganizerMessage: string | null;
  meetingOrganizerMessageImageUrl: string | null;
  recurrence: {
    frequency: RecurrenceFrequency;
    interval: number;
    byWeekday: number[];
    until: string | null;
  } | null;
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
  communities,
  categories,
}: {
  existingEvent?: ExistingEvent;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
  communities: EventCommunityOption[];
  categories: EventCategoryOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);
  // "Notify everyone about the new link?" prompt (edit mode only) — set
  // right after a successful save whose meetingUrl differs from what the
  // event had before, holding the saved event's id so the dialog's actions
  // know what to resend/navigate to. Null means no prompt is showing.
  const [linkChangePrompt, setLinkChangePrompt] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // Waiting-room greeting shown to attendees on /meet/event/[id] before
  // Start (meeting-join-experience) — plain local state like heroImage
  // above, not RHF-managed, since it's optional auxiliary content outside
  // createEventSchema/updateEventSchema's validated fields.
  const [meetingOrganizerMessage, setMeetingOrganizerMessage] = useState(existingEvent?.meetingOrganizerMessage ?? "");
  const [meetingOrganizerMessageImage, setMeetingOrganizerMessageImage] = useState<File | null>(null);

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
          // Same reasoning as invitedUserIds — co-hosts are create-only from
          // this form; after creation, the host/an existing co-host manages
          // them live from the meeting's own participant list instead
          // (POST /api/events/:id/meeting/co-hosts), not from an edit here.
          coHostUserIds: [],
          // Unlike invitedUserIds/coHostUserIds above, this IS genuinely
          // editable from this form — the event's real current tags, not
          // hardcoded empty.
          communityIds: existingEvent.communityIds,
          categoryIds: existingEvent.categoryIds,
          meetLinkSource: existingEvent.meetLinkSource,
          recurrence: existingEvent.recurrence,
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const isCaseDiscussion = form.watch("type") === EventType.case_discussion;
  const visibility = form.watch("visibility");
  const isRestricted = visibility === EventVisibility.invited;
  const isOpen = form.watch("open");
  const meetLinkSource = form.watch("meetLinkSource");
  const selectedCommunityIds = form.watch("communityIds");

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
      formData.append("meetLinkSource", values.meetLinkSource);
      if (!existingEvent) {
        formData.append("visibility", values.visibility);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
        formData.append("coHostUserIds", JSON.stringify(values.coHostUserIds));
      }
      // Unlike invitedUserIds/coHostUserIds above, genuinely editable —
      // sent in both create and edit mode, same getAll()-per-value shape as
      // Library's categoryIds field.
      values.communityIds.forEach((communityId) => formData.append("communityIds", communityId));
      values.categoryIds.forEach((categoryId) => formData.append("categoryIds", categoryId));
      if (values.recurrence) formData.append("recurrence", JSON.stringify(values.recurrence));
      if (heroImage) formData.append("heroImage", heroImage);
      if (meetingOrganizerMessage.trim()) formData.append("meetingOrganizerMessage", meetingOrganizerMessage.trim());
      if (meetingOrganizerMessageImage) formData.append("meetingOrganizerMessageImage", meetingOrganizerMessageImage);

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

      // The meeting link just changed to a real value (not cleared to
      // blank) — either the platform itself (Nasiha Conference/Google
      // Meet/manual, which always regenerates a brand-new link server-side,
      // see updateEvent's platformChanged branch) or, staying on manual, the
      // pasted link text. Anyone who already RSVP'd/registered/was invited
      // may still have the old one saved, so offer to resend before
      // navigating away rather than silently leaving them with a stale link.
      const linkMayHaveChanged =
        existingEvent &&
        (values.meetLinkSource !== existingEvent.meetLinkSource ||
          (values.meetLinkSource === "manual" && values.meetingUrl && values.meetingUrl !== existingEvent.meetingUrl));
      if (linkMayHaveChanged) {
        setLinkChangePrompt(id);
        setSubmitting(false);
        return;
      }

      if (existingEvent) {
        // Replace (not push) so this edit page's history entry doesn't
        // linger for BackLink's router.back() on the details page to land
        // on — same rationale as WritePostForm/EditThreadForm.
        router.replace(`/calendar/${id}?saved=1`);
      } else {
        router.push("/calendar");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Resolves the "Notify everyone about the new link?" prompt — either
   * choice navigates on to the saved event's detail page afterward, since
   * the edit itself already succeeded either way. A failed resend here is
   * best-effort from the UI's perspective too: it doesn't block navigation,
   * since the organizer can always retry from the "Resend Notifications"
   * button on the detail page directly.
   */
  async function resolveLinkChangePrompt(shouldNotify: boolean) {
    const id = linkChangePrompt;
    if (!id) return;
    if (shouldNotify) {
      setResending(true);
      try {
        const csrfToken = await getCsrfToken();
        await fetch(`/api/events/${id}/resend-notifications`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
        });
      } catch {
        // Best-effort — see comment above.
      } finally {
        setResending(false);
      }
    }
    setLinkChangePrompt(null);
    router.replace(`/calendar/${id}?saved=1`);
    router.refresh();
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
          name="communityIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Communities</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-4 rounded-md border p-3">
                  {communities.map((community) => (
                    <label key={community.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={field.value.includes(community.id)}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked
                              ? [...field.value, community.id]
                              : field.value.filter((id) => id !== community.id),
                          )
                        }
                      />
                      {community.name}
                    </label>
                  ))}
                </div>
              </FormControl>
              <FormDescription>Select at least one community this event belongs to.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedCommunityIds.length > 0 && (
          <FormField
            control={form.control}
            name="categoryIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categories (optional)</FormLabel>
                <FormControl>
                  <CategoryCheckboxField
                    categories={categories.filter((category) => selectedCommunityIds.includes(category.communityId))}
                    communities={communities.filter((community) => selectedCommunityIds.includes(community.id))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
                  <Input
                    type="datetime-local"
                    step={DATETIME_LOCAL_STEP_SECONDS}
                    {...field}
                    onBlur={(event) => {
                      field.onChange(snapDatetimeLocalValue(event.target.value));
                      field.onBlur();
                    }}
                  />
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
                    step={DATETIME_LOCAL_STEP_SECONDS}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                    onBlur={(e) => {
                      if (e.target.value) field.onChange(snapDatetimeLocalValue(e.target.value));
                      field.onBlur();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="recurrence"
          render={({ field }) => {
            const recurrence = field.value;
            const repeats = recurrence !== null;
            return (
              <FormItem className="rounded-md border p-4">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <FormLabel>Repeat</FormLabel>
                    <FormDescription>
                      Changing the repeat schedule on an existing series updates all upcoming occurrences —
                      there&apos;s no way to edit or skip a single date.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={repeats}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          field.onChange(null);
                          return;
                        }
                        // Default to the start date's own weekday so a host
                        // who never touches the day picker doesn't hit the
                        // "select at least one day" validation trap silently.
                        const startsAt = new Date(form.getValues("startsAt"));
                        const defaultWeekday = Number.isNaN(startsAt.getTime()) ? [] : [startsAt.getDay()];
                        field.onChange({
                          frequency: RecurrenceFrequency.weekly,
                          interval: 1,
                          byWeekday: defaultWeekday,
                          until: null,
                        });
                      }}
                    />
                  </FormControl>
                </div>
                {repeats && recurrence && (
                  <div className="mt-3 flex flex-col gap-3">
                    <Select
                      value={recurrence.frequency}
                      onValueChange={(value) =>
                        field.onChange({
                          ...recurrence,
                          frequency: value as RecurrenceFrequency,
                          byWeekday: value === RecurrenceFrequency.weekly ? recurrence.byWeekday : [],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RecurrenceFrequency.daily}>Daily</SelectItem>
                        <SelectItem value={RecurrenceFrequency.weekly}>Weekly</SelectItem>
                        <SelectItem value={RecurrenceFrequency.monthly}>Monthly</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2 text-sm">
                      <span>Every</span>
                      <Input
                        type="number"
                        min={1}
                        max={52}
                        className="w-16"
                        value={recurrence.interval}
                        onChange={(e) =>
                          field.onChange({ ...recurrence, interval: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                      <span>
                        {recurrence.frequency === RecurrenceFrequency.daily
                          ? "day(s)"
                          : recurrence.frequency === RecurrenceFrequency.weekly
                            ? "week(s)"
                            : "month(s)"}
                      </span>
                    </div>

                    {recurrence.frequency === RecurrenceFrequency.weekly && (
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          {WEEKDAY_LABELS.map((label, day) => (
                            <Button
                              key={label}
                              type="button"
                              size="sm"
                              variant={recurrence.byWeekday.includes(day) ? "default" : "outline"}
                              onClick={() => field.onChange({ ...recurrence, byWeekday: toggleWeekday(recurrence.byWeekday, day) })}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                        {/* FormMessage below only reads the top-level "recurrence"
                            field's error, which has no .message of its own when
                            the actual Zod issue is nested at recurrence.byWeekday —
                            read that path directly so this doesn't fail silently. */}
                        {form.formState.errors.recurrence?.byWeekday?.message ? (
                          <p className="text-xs font-medium text-destructive">
                            {String(form.formState.errors.recurrence.byWeekday.message)}
                          </p>
                        ) : null}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Checkbox
                        checked={recurrence.until !== null}
                        onCheckedChange={(checked) =>
                          field.onChange({
                            ...recurrence,
                            until: checked === true ? defaultUntilIso(form.getValues("startsAt")) : null,
                          })
                        }
                      />
                      <span>Repeat until</span>
                      {recurrence.until && (
                        <Input
                          type="date"
                          className="w-auto"
                          value={recurrence.until.slice(0, 10)}
                          onChange={(e) => field.onChange({ ...recurrence, until: `${e.target.value}T23:59:59.000Z` })}
                        />
                      )}
                    </div>
                    {form.formState.errors.recurrence?.until?.message ? (
                      <p className="text-xs font-medium text-destructive">
                        {String(form.formState.errors.recurrence.until.message)}
                      </p>
                    ) : null}

                    <p className="text-xs text-muted-foreground">
                      {describeRecurrence({
                        ...recurrence,
                        until: recurrence.until ? new Date(recurrence.until) : null,
                      })}
                    </p>
                  </div>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="flex flex-col gap-3">
          <FormField
            control={form.control}
            name="meetLinkSource"
            render={({ field }) => (
              <FormItem className="rounded-md border p-4">
                <FormLabel>Meeting link</FormLabel>
                <FormDescription>
                  Nasiha Conference and Google Meet both auto-generate their own meeting link — or paste your own
                  below. Nasiha Conference gives you real in-meeting host controls (admit, mute, or remove
                  participants), and lets you and any co-hosts you name below start or stop recording. Google Meet
                  does not record these meetings.
                  {existingEvent && (
                    <span className="mt-1 block">
                      Switching platforms here replaces the current link with a brand-new one — you&apos;ll get a
                      chance to notify everyone who already has the old link once you save.
                    </span>
                  )}
                </FormDescription>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="livekit">Nasiha Conference</SelectItem>
                      <SelectItem value="auto">Google Meet</SelectItem>
                      <SelectItem value="manual">Paste my own link</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />

          {!existingEvent && meetLinkSource === "livekit" && (
            <FormField
              control={form.control}
              name="coHostUserIds"
              render={({ field }) => (
                <FormItem className="rounded-md border p-4">
                  <FormLabel>Co-hosts</FormLabel>
                  <FormControl>
                    <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
                  </FormControl>
                  <FormDescription>
                    Co-hosts can start/stop recording and name further co-hosts, the same as you. You can also add
                    or remove co-hosts from the participant list once the meeting is underway.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

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

        <div className="flex flex-col gap-2">
          <label htmlFor="waiting-room-message" className="text-sm font-medium">
            Waiting room message (optional)
          </label>
          <p className="text-xs text-muted-foreground">
            Shown to attendees who join before you start the meeting, on the in-app waiting room page.
          </p>
          <Textarea
            id="waiting-room-message"
            rows={3}
            value={meetingOrganizerMessage}
            onChange={(e) => setMeetingOrganizerMessage(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="waiting-room-image" className="text-sm font-medium">
            Waiting room image (optional)
          </label>
          {existingEvent?.meetingOrganizerMessageImageUrl && !meetingOrganizerMessageImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={existingEvent.meetingOrganizerMessageImageUrl}
              alt="Current waiting room image"
              className="h-32 w-full max-w-xs rounded-md object-cover"
            />
          )}
          <input
            id="waiting-room-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setMeetingOrganizerMessageImage(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          />
          {existingEvent?.meetingOrganizerMessageImageUrl && (
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

      {existingEvent && (
        <AlertDialog
          open={linkChangePrompt !== null}
          onOpenChange={(next) => {
            if (!next && !resending) resolveLinkChangePrompt(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Notify everyone about the new meeting link?</AlertDialogTitle>
              <AlertDialogDescription>
                Your changes are saved. Anyone who already RSVP&apos;d
                {existingEvent.visibility === EventVisibility.invited
                  ? " to this invited event"
                  : existingEvent.open
                    ? ", registered as a guest, or was already invited"
                    : " or was already invited"}{" "}
                may still have the old link saved — if they don&apos;t revisit this event before it starts, they
                could show up to the wrong place, or nowhere at all. Resending sends a fresh bell notification and
                email (
                {existingEvent.visibility === EventVisibility.invited
                  ? "to this event's current invitee list"
                  : existingEvent.open
                    ? "to every member, plus a reminder email to every registered guest"
                    : "to every member"}
                ) with today&apos;s link, so everyone shows up to the right place at the scheduled time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={resending}
                onClick={(e) => {
                  e.preventDefault();
                  resolveLinkChangePrompt(false);
                }}
              >
                Not now
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={resending}
                onClick={(e) => {
                  e.preventDefault();
                  resolveLinkChangePrompt(true);
                }}
              >
                {resending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Notify everyone
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Form>
  );
}
