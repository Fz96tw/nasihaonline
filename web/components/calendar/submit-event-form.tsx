"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fromZonedTime } from "date-fns-tz";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
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
import { EventType, EventVisibility } from "@/lib/generated/prisma/enums";
import { type EventCategoryOption, type EventCommunityOption } from "@/lib/events";
import { createEventSchema, draftEventSchema, updateEventSchema, type CreateEventValues } from "@/lib/validation/event";
import { DEFAULT_EVENT_TIME_ZONE } from "@/lib/format-date";
import { getCsrfToken } from "@/lib/csrf-client";
import { DiscardEventDraftButton } from "@/components/calendar/discard-event-draft-button";
import { BasicsStep } from "@/components/calendar/event-form/basics-step";
import { WhenStep } from "@/components/calendar/event-form/when-step";
import { WhoStep } from "@/components/calendar/event-form/who-step";
import { WhereStep } from "@/components/calendar/event-form/where-step";
import {
  EVENT_STEPS,
  EVENT_WIZARD_STEPS,
  stepForField,
  type EventFieldStepId,
  type EventStepId,
} from "@/components/calendar/event-form/steps";
import { ReviewStep } from "@/components/calendar/event-form/review-step";
import { useEventStepStatuses } from "@/components/calendar/event-form/use-event-step-statuses";
import { WizardPanel, WizardShell, type WizardNavSource } from "@/components/shared/wizard/wizard-shell";
import {
  LAST_MEET_LINK_SOURCE_KEY,
  toDatetimeLocalValue,
  type ExistingEvent,
} from "@/components/calendar/event-form/shared";

const DEFAULT_VALUES: CreateEventValues = {
  title: "",
  description: null,
  type: "" as EventType,
  startsAt: "",
  endsAt: null,
  open: false,
  guestLinkEnabled: false,
  meetingUrl: null,
  deidentificationConfirmed: false,
  timezone: null,
  visibility: EventVisibility.community,
  invitedUserIds: [],
  coHostUserIds: [],
  communityIds: [],
  allCommunities: false,
  categoryIds: [],
  meetLinkSource: "livekit",
  recurrence: null,
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
 * only `open` stays editable afterward. EXCEPT while
 * `existingEvent.isDraft`: a draft's real first publish is deferred from
 * creation, so this section (and invitedUserIds/coHostUserIds) stays
 * visible and editable for as long as the event is still a draft — see
 * `isFirstSubmission` below.
 *
 * Save as Draft initiative: the live RHF resolver is always the lenient
 * `draftEventSchema` (only title/type/startsAt required) so neither button
 * is ever blocked by an incomplete form; "Publish Event"/"Save Changes"
 * instead runs the real strict schema (createEventSchema/updateEventSchema)
 * by hand inside onSubmit, mapping any failures onto the form via
 * setError. "Save Draft" skips that manual check entirely and posts with
 * `action: "draft"`.
 */
export function SubmitEventForm({
  existingEvent,
  currentUserId,
  canTargetAllCommunities = false,
  communities,
  categories,
}: {
  existingEvent?: ExistingEvent;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
  /** Admins/moderators only — shows the "All communities" option. */
  canTargetAllCommunities?: boolean;
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
  // Which button was actually clicked — read synchronously inside onSubmit
  // (a ref, not state, since RHF's handleSubmit fires in the same
  // click→submit cycle a state update wouldn't be visible in yet).
  const pendingActionRef = useRef<"draft" | "primary">("primary");
  // "Save Draft" on an existing draft stays on this same page (no
  // navigation, so the SavedBanner-on-redirect convention every other save
  // in this app uses doesn't fire) — this is the only in-component
  // confirmation for that one case. Cleared on the next submit attempt.
  const [draftSaved, setDraftSaved] = useState(false);
  // Timezone renders as plain text ("Times are in X. Change") until the host
  // asks to change it — nearly everyone schedules in their own zone.
  const [editingTimezone, setEditingTimezone] = useState(false);
  // True while "Ends" holds a value we filled in (start + 1h) rather than one
  // the host typed, so moving "Starts" keeps the pair in step but never
  // overwrites an end time the host chose themselves. An existing event's
  // stored end is always treated as host-chosen.
  const endsAutoFilledRef = useRef(false);

  // A draft's audience/invitedUserIds/coHostUserIds are genuinely still
  // being decided — this is its real first submission, deferred from
  // creation — so those fields behave exactly like brand-new-event mode
  // (rendered + required) for as long as the event stays a draft.
  const isFirstSubmission = !existingEvent || existingEvent.isDraft;

  const form = useForm<CreateEventValues>({
    // Always the lenient draft schema for live per-field validation — the
    // real strict schema (createEventSchema/updateEventSchema) runs by hand
    // in onSubmit only when the primary button (not "Save Draft") was
    // clicked. See this component's doc comment for why edit mode still
    // can't validate a non-draft event's save against createEventSchema
    // (invitedUserIds is hardcoded/hidden once isFirstSubmission is false).
    resolver: zodResolver(draftEventSchema) as Resolver<CreateEventValues>,
    defaultValues: existingEvent
      ? {
          title: existingEvent.title,
          description: existingEvent.description,
          type: existingEvent.type,
          // Redisplayed in the zone the event was actually created/last
          // saved in (falling back to the same fixed default
          // formatEventDateTime uses for pre-existing null rows) — NOT the
          // editor's own current browser zone, so re-editing from a
          // different zone than it was created in doesn't silently shift
          // the displayed wall-clock time. The timezone field below is
          // filled with this same value, so the Select reflects it too.
          startsAt: toDatetimeLocalValue(existingEvent.startsAt, existingEvent.timezone ?? DEFAULT_EVENT_TIME_ZONE),
          endsAt: toDatetimeLocalValue(existingEvent.endsAt, existingEvent.timezone ?? DEFAULT_EVENT_TIME_ZONE) || null,
          open: existingEvent.open,
          guestLinkEnabled: existingEvent.guestLinkEnabled,
          meetingUrl: existingEvent.meetingUrl,
          deidentificationConfirmed: existingEvent.deidentificationConfirmed,
          timezone: existingEvent.timezone,
          // The invited list itself isn't editable from this form once past
          // a draft's first submission (Audience-Restricted Group Events —
          // see ManageInvitees on the event detail page for that) but
          // visibility itself needs to be the real value so isRestricted
          // below correctly hides the "Open to the public" toggle etc. for
          // an actually-restricted event.
          visibility: existingEvent.visibility,
          // Real values while still a draft (resuming its actual picks);
          // harmless-placeholder empty otherwise, same as before this
          // initiative — this form section is hidden once isFirstSubmission
          // is false, so these are never sent for a real (non-draft) edit.
          invitedUserIds: existingEvent.invitedUserIds,
          coHostUserIds: existingEvent.coHostUserIds,
          // Unlike invitedUserIds/coHostUserIds above, this IS genuinely
          // editable from this form — the event's real current tags, not
          // hardcoded empty.
          communityIds: existingEvent.communityIds,
          allCommunities: existingEvent.allCommunities,
          categoryIds: existingEvent.categoryIds,
          meetLinkSource: existingEvent.meetLinkSource,
          recurrence: existingEvent.recurrence,
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  // Intl.DateTimeFormat().resolvedOptions().timeZone reads the *browser's*
  // zone, which during SSR would be the server process's zone instead —
  // filled in client-side only, after mount, to avoid a hydration mismatch
  // (same reasoning as isPresenterOverlaySupported's client-only check
  // elsewhere in this codebase). Only when the field is still unset: a
  // brand-new event (DEFAULT_VALUES.timezone is null) or a legacy event
  // saved before Event.timezone existed — never overwrites a real stored
  // or already-chosen value.
  useEffect(() => {
    if (!form.getValues("timezone")) {
      form.setValue("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New events start on whichever platform this host picked last time.
  // localStorage can throw or be empty (private windows etc.) — fall back to
  // the schema default silently.
  useEffect(() => {
    if (existingEvent) return;
    try {
      const last = window.localStorage.getItem(LAST_MEET_LINK_SOURCE_KEY);
      if (last === "livekit" || last === "auto" || last === "manual") form.setValue("meetLinkSource", last);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCaseDiscussion = form.watch("type") === EventType.case_discussion;

  // Warn before the tab is closed/reloaded with edits that haven't been saved.
  // savedRef is the baseline for the state that lives outside RHF (the image
  // pickers and the waiting-room note); it moves forward after a draft save
  // that stays on this page. leavingRef is set once a save succeeds and the
  // page is about to navigate away, so that navigation isn't second-guessed.
  // In-app link clicks aren't covered — the browser only exposes beforeunload.
  const savedRef = useRef<{ message: string; hero: File | null; waitingRoomImage: File | null }>({
    message: existingEvent?.meetingOrganizerMessage ?? "",
    hero: null,
    waitingRoomImage: null,
  });
  const leavingRef = useRef(false);
  const hasUnsavedChanges =
    form.formState.isDirty ||
    heroImage !== savedRef.current.hero ||
    meetingOrganizerMessageImage !== savedRef.current.waitingRoomImage ||
    meetingOrganizerMessage.trim() !== savedRef.current.message.trim();
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  // Wizard navigation. The step map shows every step and lets the host jump to
  // any of them at any time; "Next" only warns (it never blocks) about the
  // step being left, using the same strict schema Publish runs.
  const [activeStep, setActiveStep] = useState<EventStepId>("basics");
  const [visitedSteps, setVisitedSteps] = useState<ReadonlySet<EventStepId>>(() => new Set());
  const { statuses: stepStatuses, issuesByStep } = useEventStepStatuses({
    form,
    isFirstSubmission,
    isExisting: existingEvent !== undefined,
    visited: visitedSteps,
  });

  // Errors set by hand ("Next", or a rejected Publish) are never re-checked by
  // RHF on a plain change — mode "onTouched" only re-validates after a blur,
  // which selects, checkboxes and the pickers never fire. issuesByStep is
  // recomputed from the live values on every render, so drop any error whose
  // field no longer fails the strict schema.
  const formErrors = form.formState.errors;
  const failingFields = new Set(
    EVENT_STEPS.flatMap((step) => issuesByStep[step.id].map((issue) => issue.path.split(".")[0])),
  );
  useEffect(() => {
    for (const field of Object.keys(formErrors)) {
      if (!failingFields.has(field)) form.clearErrors(field as keyof CreateEventValues);
    }
  });

  function handleStepSelect(id: string, source: WizardNavSource) {
    const leaving = activeStep;
    setVisitedSteps((prev) => new Set(prev).add(leaving).add(id as EventStepId));
    if (source === "next") {
      for (const issue of issuesByStep[leaving as EventFieldStepId] ?? []) {
        form.setError(issue.path as keyof CreateEventValues, { message: issue.message });
      }
    }
    setActiveStep(id as EventStepId);
  }

  /**
   * A save was rejected for fields the host may not be looking at (every step
   * but the active one is hidden) — bring them to the first step that has a
   * problem. A failed Publish from Review stays put: Review already lists the
   * blocking steps with links.
   */
  function jumpToFirstProblemStep(fieldPaths: string[], { stayOnReview }: { stayOnReview: boolean }) {
    if (stayOnReview && activeStep === "review") return;
    const failing = new Set(fieldPaths.map((path) => stepForField(path.split(".")[0])));
    const target = EVENT_STEPS.find((step) => failing.has(step.id));
    if (target) setActiveStep(target.id);
  }

  function onInvalid(errors: FieldErrors<CreateEventValues>) {
    jumpToFirstProblemStep(Object.keys(errors), { stayOnReview: false });
  }
  const visibility = form.watch("visibility");
  const isRestricted = visibility === EventVisibility.invited;

  async function onSubmit(values: CreateEventValues) {
    // "draft" always saves as a draft; "primary" means whichever real
    // submission this event is currently due for — publishing (brand-new
    // event, or a draft's first publish) or a normal save (an
    // already-published event's edit).
    const action = pendingActionRef.current === "draft" ? "draft" : isFirstSubmission ? "publish" : "save";

    // The live RHF resolver (draftEventSchema) is deliberately lenient so
    // neither button is ever blocked mid-edit — "Publish Event"/"Save
    // Changes" instead runs the real strict schema here, by hand, only when
    // that's the button that was actually clicked.
    if (action !== "draft") {
      const strictSchema = isFirstSubmission ? createEventSchema : updateEventSchema;
      const result = strictSchema.safeParse(values);
      if (!result.success) {
        for (const issue of result.error.issues) {
          form.setError(issue.path.join(".") as keyof CreateEventValues, {
            message: issue.message,
          });
        }
        jumpToFirstProblemStep(
          result.error.issues.map((issue) => issue.path.join(".")),
          { stayOnReview: true },
        );
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setDraftSaved(false);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("action", action);
      formData.append("title", values.title);
      if (values.description) formData.append("description", values.description);
      formData.append("type", values.type);
      // datetime-local values are converted to real ISO instants here, in
      // the *selected* timezone field (not necessarily the browser's own —
      // that's the whole point of the picker below) — parsing the raw
      // string server-side would use the server's timezone instead (§4.6
      // requires UTC storage). RequestMeetingDialog's proposedTimes does a
      // separate, still browser-zone-only conversion — out of scope here.
      const zone = values.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      formData.append("startsAt", fromZonedTime(values.startsAt, zone).toISOString());
      if (values.endsAt) formData.append("endsAt", fromZonedTime(values.endsAt, zone).toISOString());
      // The zone startsAt/endsAt above were actually entered in — stored
      // alongside them so notification/email "when" text can be formatted
      // back into the organizer's wall-clock time instead of the server
      // process's own timezone (see Event.timezone's schema comment).
      formData.append("timezone", zone);
      // "Open to the public" doesn't make sense for a restricted event —
      // same "can't linger as true after switching away" rationale as
      // deidentificationConfirmed below.
      formData.append("open", String(!isRestricted && values.open));
      // Only meaningful for a public event — can't linger as true after switching the audience away from "Open to the public".
      formData.append("guestLinkEnabled", String(!isRestricted && values.open && values.guestLinkEnabled));
      if (values.meetingUrl) formData.append("meetingUrl", values.meetingUrl);
      // Only relevant (and only enforced) for Case Discussion events — omit
      // for every other type so it can't linger as `true` from switching
      // away from Case Discussion after checking it.
      formData.append("deidentificationConfirmed", String(isCaseDiscussion && values.deidentificationConfirmed));
      formData.append("meetLinkSource", values.meetLinkSource);
      if (isFirstSubmission) {
        formData.append("visibility", values.visibility);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
        formData.append("coHostUserIds", JSON.stringify(values.coHostUserIds));
      }
      // Unlike invitedUserIds/coHostUserIds above, genuinely editable —
      // sent in both create and edit mode, same getAll()-per-value shape as
      // Library's categoryIds field.
      if (values.allCommunities) formData.append("allCommunities", "true");
      else values.communityIds.forEach((communityId) => formData.append("communityIds", communityId));
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
      if (action === "draft" && existingEvent) {
        // Stays on this page, so what was just saved becomes the new "unchanged" baseline.
        savedRef.current = { message: meetingOrganizerMessage, hero: heroImage, waitingRoomImage: meetingOrganizerMessageImage };
        form.reset(form.getValues());
      } else {
        leavingRef.current = true;
      }
      try {
        window.localStorage.setItem(LAST_MEET_LINK_SOURCE_KEY, values.meetLinkSource);
      } catch {
        // ignore
      }

      if (action === "draft") {
        if (existingEvent) {
          // Same page, no navigation — the SavedBanner-on-redirect
          // convention every other save here uses never fires, so this is
          // the only confirmation the save actually happened.
          setDraftSaved(true);
        } else {
          // Brand-new draft — the id only exists now, so this is the first
          // point a resumable edit URL is reachable from. Real navigation
          // to a fresh page, so the usual ?saved=1 + SavedBanner convention
          // applies there instead.
          router.replace(`/calendar/${id}/edit?saved=1`);
        }
        router.refresh();
        return;
      }

      // The meeting link just changed to a real value (not cleared to
      // blank) — either the platform itself (Nasiha Conference/Google
      // Meet/manual, which always regenerates a brand-new link server-side,
      // see updateEvent's platformChanged branch) or, staying on manual, the
      // pasted link text. Anyone who already RSVP'd/registered/was invited
      // may still have the old one saved, so offer to resend before
      // navigating away rather than silently leaving them with a stale
      // link. Only applies to "save" (editing an already-live event) —
      // "publish" (brand-new, or a draft's first publish) already sends the
      // real invite/announcement notification as part of publishing, so a
      // resend here would double-notify the same audience.
      const linkMayHaveChanged =
        action === "save" &&
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
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-5" noValidate>
        <WizardShell
          steps={EVENT_WIZARD_STEPS.map((step) => ({ ...step, status: stepStatuses[step.id] }))}
          activeId={activeStep}
          onSelect={handleStepSelect}
        >
          <WizardPanel id="basics">
            <BasicsStep form={form} existingEvent={existingEvent} heroImage={heroImage} setHeroImage={setHeroImage} />
          </WizardPanel>

          <WizardPanel id="when">
            <WhenStep
              form={form}
              editingTimezone={editingTimezone}
              setEditingTimezone={setEditingTimezone}
              endsAutoFilledRef={endsAutoFilledRef}
            />
          </WizardPanel>

          <WizardPanel id="who">
            <WhoStep
              form={form}
              isFirstSubmission={isFirstSubmission}
              currentUserId={currentUserId}
              canTargetAllCommunities={canTargetAllCommunities}
              communities={communities}
              categories={categories}
            />
          </WizardPanel>

          <WizardPanel id="where">
            <WhereStep
              form={form}
              existingEvent={existingEvent}
              isFirstSubmission={isFirstSubmission}
              currentUserId={currentUserId}
              meetingOrganizerMessage={meetingOrganizerMessage}
              setMeetingOrganizerMessage={setMeetingOrganizerMessage}
              meetingOrganizerMessageImage={meetingOrganizerMessageImage}
              setMeetingOrganizerMessageImage={setMeetingOrganizerMessageImage}
            />
          </WizardPanel>

          <WizardPanel id="review">
            <ReviewStep
              form={form}
              existingEvent={existingEvent}
              isFirstSubmission={isFirstSubmission}
              communities={communities}
              categories={categories}
              issuesByStep={issuesByStep}
              statuses={stepStatuses}
              heroImage={heroImage}
              meetingOrganizerMessage={meetingOrganizerMessage}
              onEdit={(id) => handleStepSelect(id, "map")}
            />
          </WizardPanel>
        </WizardShell>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {draftSaved && <p className="text-sm text-success">Draft saved.</p>}

        <div className="flex items-center gap-3">
          {isFirstSubmission && (
            <Button
              type="submit"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                pendingActionRef.current = "draft";
              }}
            >
              {submitting && pendingActionRef.current === "draft" ? "Saving…" : "Save Draft"}
            </Button>
          )}
          {/* A brand-new event (or draft) publishes from the Review step only; an
            already-published event's edit can be saved from any step, since every
            step starts out complete there. */}
          {(activeStep === "review" || !isFirstSubmission) && (
            <Button
              type="submit"
              disabled={submitting}
              onClick={() => {
                pendingActionRef.current = "primary";
              }}
            >
              {submitting && pendingActionRef.current === "primary"
                ? "Saving…"
                : isFirstSubmission
                  ? "Publish Event"
                  : "Save Changes"}
            </Button>
          )}
          {existingEvent?.isDraft && <DiscardEventDraftButton eventId={existingEvent.id} title={existingEvent.title} />}
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
                may still have the old link saved — if they don&apos;t revisit this event before it starts, they could
                show up to the wrong place, or nowhere at all. Resending sends a fresh bell notification and email (
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
