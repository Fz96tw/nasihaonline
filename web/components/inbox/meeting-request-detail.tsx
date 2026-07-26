"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { type MeetingRequestListItem } from "@/lib/inbox";
import { MEETING_REQUEST_STATUS_BADGE_VARIANT, MEETING_REQUEST_STATUS_LABELS } from "@/lib/meeting-requests";
import { getCsrfToken } from "@/lib/csrf-client";
import { getLocalTimeZoneAbbreviation } from "@/lib/timezone";
import { useHasMounted } from "@/lib/use-has-mounted";

const MAX_PROPOSED_TIMES = 5;

// timeZoneName makes explicit which zone a bare time means (see lib/timezone.ts)
// — proposedTimes has no picker of its own, so without this a sender/recipient
// in different zones would each see a correct-but-unlabeled local conversion.
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

async function patchMeetingRequest(id: string, body: Record<string, unknown>) {
  const csrfToken = await getCsrfToken();
  const res = await fetch(`/api/inbox/meeting-requests/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
  }
}

const rescheduleFormSchema = z.object({
  proposedTimes: z
    .array(z.object({ value: z.string().min(1, "Pick a date and time") }))
    .min(1)
    .max(MAX_PROPOSED_TIMES),
  message: z.string().trim().max(1000).nullable(),
});

type RescheduleFormValues = z.infer<typeof rescheduleFormSchema>;

function RescheduleForm({
  meetingRequestId,
  onDone,
  onCancel,
}: {
  meetingRequestId: string;
  onDone: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleFormSchema),
    defaultValues: { proposedTimes: [{ value: "" }], message: null },
    mode: "onTouched",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "proposedTimes" });
  const hasMounted = useHasMounted();

  async function onSubmit(values: RescheduleFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await patchMeetingRequest(meetingRequestId, {
        action: "reschedule",
        proposedTimes: values.proposedTimes.map((time) => new Date(time.value).toISOString()),
        message: values.message?.trim() ? values.message.trim() : null,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border p-3" noValidate>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FormLabel>Propose new times</FormLabel>
            {hasMounted && (
              <span className="text-xs text-muted-foreground">(your time zone: {getLocalTimeZoneAbbreviation()})</span>
            )}
          </div>
          {fields.map((item, index) => (
            <FormField
              key={item.id}
              control={form.control}
              name={`proposedTimes.${index}.value`}
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 flex-shrink-0"
                        aria-label="Remove this time"
                        onClick={() => remove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {fields.length < MAX_PROPOSED_TIMES && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => append({ value: "" })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add another time
            </Button>
          )}
        </div>

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Textarea rows={2} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Sending…" : "Send new times"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

const editFormSchema = z.object({
  topic: z.string().trim().min(1, "Describe what you'd like to discuss").max(200),
  message: z.string().trim().max(1000).nullable(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

/**
 * Lets the sender correct/expand their own request's topic or message
 * while it's still open (pending, or rescheduled) — see editMeetingRequest
 * in meeting-requests-server.ts. Purely a text correction: no separate
 * notification is sent, the recipient sees the update whenever they next
 * open the still-open item.
 */
function EditRequestForm({
  meetingRequestId,
  initialTopic,
  initialMessage,
  onDone,
  onCancel,
}: {
  meetingRequestId: string;
  initialTopic: string;
  initialMessage: string | null;
  onDone: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: { topic: initialTopic, message: initialMessage },
    mode: "onTouched",
  });

  async function onSubmit(values: EditFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await patchMeetingRequest(meetingRequestId, {
        action: "edit",
        topic: values.topic,
        message: values.message?.trim() ? values.message.trim() : null,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border p-3" noValidate>
        <FormField
          control={form.control}
          name="topic"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * Detail pane for a meeting-request inbox item (§4.7). Rendered directly
 * from the merged inbox list's inline data — there's no
 * GET /api/inbox/meeting-requests/:id per PRD's route list, so no fetch is
 * needed. Only the recipient of a `pending` request sees accept/decline/
 * propose-new-time actions; the sender just watches the status.
 */
export function MeetingRequestDetail({
  item,
  onBack,
  onUpdated,
}: {
  item: MeetingRequestListItem;
  onBack: () => void;
  onUpdated: () => Promise<unknown>;
}) {
  const [pendingAction, setPendingAction] = useState<"accept" | "decline" | "cancel" | null>(null);
  const [reschedulingOpen, setReschedulingOpen] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState(item.proposedTimes[0] ?? "");
  const hasMounted = useHasMounted();

  const canRespond = item.direction === "received" && item.status === "pending";
  const canEdit = item.direction === "sent" && (item.status === "pending" || item.status === "rescheduled");

  async function handleAccept() {
    setPendingAction("accept");
    setError(null);
    try {
      await patchMeetingRequest(
        item.id,
        item.proposedTimes.length > 1 ? { action: "accept", selectedTime } : { action: "accept" },
      );
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDecline() {
    setPendingAction("decline");
    setError(null);
    try {
      await patchMeetingRequest(item.id, { action: "decline" });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCancel() {
    const confirmMessage =
      item.status === "accepted"
        ? "Cancel this meeting? This deletes the Google Calendar event for both of you."
        : "Withdraw this meeting request?";
    if (!window.confirm(confirmMessage)) return;
    setPendingAction("cancel");
    setError(null);
    try {
      await patchMeetingRequest(item.id, { action: "cancel" });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="truncate font-semibold">{item.topic}</div>
          <div className="truncate text-xs text-muted-foreground">
            {item.direction === "sent" ? `Requested with ${item.otherPartyName}` : `From ${item.otherPartyName}`}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Badge variant={MEETING_REQUEST_STATUS_BADGE_VARIANT[item.status]} className="w-fit">
          {MEETING_REQUEST_STATUS_LABELS[item.status]}
        </Badge>

        {item.status !== "accepted" && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Proposed times</div>
            {canRespond && item.proposedTimes.length > 1 ? (
              <div className="flex flex-col gap-1.5 text-sm">
                {item.proposedTimes.map((time) => (
                  <label key={time} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="selectedTime"
                      value={time}
                      checked={selectedTime === time}
                      onChange={() => setSelectedTime(time)}
                    />
                    {hasMounted ? formatTimestamp(time) : null}
                  </label>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {item.proposedTimes.map((time) => (
                  <li key={time}>{hasMounted ? formatTimestamp(time) : null}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(item.status === "pending" || item.status === "rescheduled") && (
          <p className="text-xs text-muted-foreground">
            If accepted, this will be a Google Meet video call — a link will be created automatically and sent
            to both of you. It&apos;ll also appear on your Calendar page&apos;s Upcoming List, visible only to
            the two of you, not the rest of the community.
          </p>
        )}

        {item.message && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Message</div>
            <p className="whitespace-pre-wrap text-sm">{item.message}</p>
          </div>
        )}

        {item.status === "accepted" && (
          <div className="flex flex-col gap-2">
            {item.scheduledAt && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Scheduled for</div>
                <p className="text-sm">{hasMounted ? formatTimestamp(item.scheduledAt) : null}</p>
              </div>
            )}
            {item.meetingUrl && (
              <Button size="sm" variant="outline" className="w-fit" asChild>
                <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <Video className="mr-1.5 h-3.5 w-3.5" />
                  Join Google Meet
                </a>
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              {item.direction === "sent"
                ? "Accepted — a confirmed Knowledge Hours spend entry was posted automatically. A pending earn entry for " +
                  item.otherPartyName +
                  " is waiting in your Contributions for you to confirm."
                : "Accepted — a pending Knowledge Hours earn entry was created for you automatically. It'll count toward your balance once " +
                  item.otherPartyName +
                  " confirms it."}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="w-fit text-destructive hover:text-destructive"
              onClick={handleCancel}
              disabled={pendingAction !== null}
            >
              {pendingAction === "cancel" ? "Cancelling…" : "Cancel meeting"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {canRespond && !reschedulingOpen && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAccept} disabled={pendingAction !== null}>
              {pendingAction === "accept" ? "Accepting…" : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReschedulingOpen(true)}
              disabled={pendingAction !== null}
            >
              Propose new time
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDecline} disabled={pendingAction !== null}>
              {pendingAction === "decline" ? "Declining…" : "Decline"}
            </Button>
          </div>
        )}

        {canEdit && !editingOpen && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditingOpen(true)} disabled={pendingAction !== null}>
              Edit
            </Button>
            {item.status === "pending" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleCancel}
                disabled={pendingAction !== null}
              >
                {pendingAction === "cancel" ? "Withdrawing…" : "Withdraw request"}
              </Button>
            )}
          </div>
        )}

        {canEdit && editingOpen && (
          <EditRequestForm
            meetingRequestId={item.id}
            initialTopic={item.topic}
            initialMessage={item.message}
            onCancel={() => setEditingOpen(false)}
            onDone={onUpdated}
          />
        )}

        {canRespond && reschedulingOpen && (
          <RescheduleForm
            meetingRequestId={item.id}
            onCancel={() => setReschedulingOpen(false)}
            onDone={onUpdated}
          />
        )}
      </div>
    </div>
  );
}
