"use client";

import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventVisibility } from "@/lib/generated/prisma/enums";
import { EVENT_TYPE_LABELS, type EventCategoryOption, type EventCommunityOption } from "@/lib/events";
import { describeRecurrence } from "@/lib/recurrence";
import type { CreateEventValues } from "@/lib/validation/event";
import { AUDIENCE_LABELS, type AudienceChoice, type ExistingEvent } from "./shared";
import { EVENT_STEPS, type EventFieldStepId, type EventStepStatuses } from "./steps";

type Issues = Record<EventFieldStepId, { path: string; message: string }[]>;

/** "YYYY-MM-DDTHH:mm" wall-clock value → readable text (the value is already in the event's own timezone). */
function formatLocalValue(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-36 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const NOT_SET = <span className="text-muted-foreground">Not set</span>;

function Section({
  title,
  stepId,
  issues,
  onEdit,
  children,
}: {
  title: string;
  stepId: EventFieldStepId;
  issues: Issues[EventFieldStepId];
  onEdit: (id: EventFieldStepId) => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(stepId)}>
          Edit
        </Button>
      </div>
      <dl className="flex flex-col gap-2">{children}</dl>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-destructive">
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Final wizard step: a read-only summary of every section with an Edit link
 * per section, and — when the strict schema would reject a publish — a list of
 * the blocking steps, each linking back to the step that fixes it. The actual
 * Publish/Save button lives with the form's action row, not here.
 */
export function ReviewStep({
  form,
  existingEvent,
  isFirstSubmission,
  communities,
  categories,
  issuesByStep,
  statuses,
  heroImage,
  meetingOrganizerMessage,
  onEdit,
}: {
  form: UseFormReturn<CreateEventValues>;
  existingEvent?: ExistingEvent;
  isFirstSubmission: boolean;
  communities: EventCommunityOption[];
  categories: EventCategoryOption[];
  issuesByStep: Issues;
  statuses: EventStepStatuses;
  heroImage: File | null;
  meetingOrganizerMessage: string;
  onEdit: (id: EventFieldStepId) => void;
}) {
  const values = form.watch();
  const isRestricted = values.visibility === EventVisibility.invited;
  const audience: AudienceChoice = isRestricted ? "invited" : values.open ? "open" : "community";
  const blockingSteps = EVENT_STEPS.filter((step) => issuesByStep[step.id].length > 0);

  const communityNames = values.allCommunities
    ? "All communities"
    : communities
        .filter((community) => values.communityIds.includes(community.id))
        .map((community) => community.name)
        .join(", ");
  const categoryNames = categories
    .filter((category) => values.categoryIds.includes(category.id))
    .map((category) => category.name)
    .join(", ");
  const meetingPlatform =
    values.meetLinkSource === "livekit"
      ? "Nasiha Conference"
      : values.meetLinkSource === "auto"
        ? "Google Meet"
        : "Your own link";
  const recurrence = values.recurrence
    ? describeRecurrence({ ...values.recurrence, until: values.recurrence.until ? new Date(values.recurrence.until) : null })
    : null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Review &amp; {isFirstSubmission ? "publish" : "save"}</h2>

      {blockingSteps.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            {isFirstSubmission ? "Fix these before you can publish. You can still save a draft." : "Fix these before you can save."}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {blockingSteps.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => onEdit(step.id)}
                >
                  {step.label}
                </button>
                <Badge variant={statuses[step.id] === "attention" ? "danger" : "warning"}>
                  {issuesByStep[step.id].length} to fix
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Everything looks complete. Check the details below, then {isFirstSubmission ? "publish" : "save"}.
        </p>
      )}

      <Section title="Basics" stepId="basics" issues={issuesByStep.basics} onEdit={onEdit}>
        <Row label="Title">{values.title.trim() || NOT_SET}</Row>
        <Row label="Type">{values.type ? EVENT_TYPE_LABELS[values.type] : NOT_SET}</Row>
        <Row label="Description">{values.description?.trim() || NOT_SET}</Row>
        <Row label="Hero image">
          {heroImage ? heroImage.name : existingEvent?.heroImageUrl ? "Current image kept" : "None"}
        </Row>
      </Section>

      <Section title="When" stepId="when" issues={issuesByStep.when} onEdit={onEdit}>
        <Row label="Starts">{formatLocalValue(values.startsAt) ?? NOT_SET}</Row>
        <Row label="Ends">{formatLocalValue(values.endsAt) ?? "Not set"}</Row>
        <Row label="Timezone">{values.timezone ?? NOT_SET}</Row>
        <Row label="Repeats">{recurrence ?? "Does not repeat"}</Row>
      </Section>

      <Section title="Who" stepId="who" issues={issuesByStep.who} onEdit={onEdit}>
        <Row label="Audience">{AUDIENCE_LABELS[audience]}</Row>
        {isFirstSubmission && isRestricted && (
          <Row label="Invited">
            {values.invitedUserIds.length > 0 ? `${values.invitedUserIds.length} member(s)` : NOT_SET}
          </Row>
        )}
        <Row label="Communities">{communityNames || NOT_SET}</Row>
        {!values.allCommunities && <Row label="Categories">{categoryNames || "None"}</Row>}
        {values.open && !isRestricted && (
          <Row label="Guest link">{values.guestLinkEnabled ? "Enabled" : "Off"}</Row>
        )}
      </Section>

      <Section title="Where" stepId="where" issues={issuesByStep.where} onEdit={onEdit}>
        <Row label="Platform">{meetingPlatform}</Row>
        {values.meetLinkSource === "manual" && <Row label="Meeting link">{values.meetingUrl || NOT_SET}</Row>}
        {isFirstSubmission && values.meetLinkSource === "livekit" && (
          <Row label="Co-hosts">
            {values.coHostUserIds.length > 0 ? `${values.coHostUserIds.length} member(s)` : "None"}
          </Row>
        )}
        <Row label="Waiting-room note">{meetingOrganizerMessage.trim() ? "Added" : "None"}</Row>
      </Section>
    </section>
  );
}
