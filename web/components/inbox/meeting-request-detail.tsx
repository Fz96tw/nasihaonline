"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { type MeetingRequestListItem } from "@/lib/inbox";
import { MEETING_REQUEST_STATUS_BADGE_VARIANT, MEETING_REQUEST_STATUS_LABELS } from "@/lib/meeting-requests";
import { getCsrfToken } from "@/lib/csrf-client";

const MAX_PROPOSED_TIMES = 5;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
          <FormLabel>Propose new times</FormLabel>
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
  const [pendingAction, setPendingAction] = useState<"accept" | "decline" | null>(null);
  const [reschedulingOpen, setReschedulingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRespond = item.direction === "received" && item.status === "pending";

  async function handleAccept() {
    setPendingAction("accept");
    setError(null);
    try {
      await patchMeetingRequest(item.id, { action: "accept" });
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

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Proposed times</div>
          <ul className="flex flex-col gap-1 text-sm">
            {item.proposedTimes.map((time) => (
              <li key={time}>{formatTimestamp(time)}</li>
            ))}
          </ul>
        </div>

        {item.message && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Message</div>
            <p className="whitespace-pre-wrap text-sm">{item.message}</p>
          </div>
        )}

        {item.status === "accepted" && (
          <p className="text-sm text-muted-foreground">
            Accepted — a confirmed Knowledge Hours spend entry was posted automatically.
          </p>
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
