"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { getCsrfToken } from "@/lib/csrf-client";

const MAX_PROPOSED_TIMES = 5;

// Form-only shape: proposedTimes is an object array so useFieldArray can key
// each row, unlike the plain string[] the POST /api/inbox/meeting-requests
// body (createMeetingRequestSchema) expects — mapped to strings on submit.
const formSchema = z.object({
  topic: z.string().trim().min(1, "Describe what you'd like to discuss").max(200),
  proposedTimes: z
    .array(z.object({ value: z.string().min(1, "Pick a date and time") }))
    .min(1)
    .max(MAX_PROPOSED_TIMES),
  message: z.string().trim().max(1000).nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  topic: "",
  proposedTimes: [{ value: "" }],
  message: null,
};

/**
 * "Request Meeting" compose UI opened from a Directory card (§4.7): topic +
 * one or more proposed times, posted to POST /api/inbox/meeting-requests.
 * The recipient responds from their Inbox, not here.
 */
export function RequestMeetingDialog({
  recipientId,
  recipientName,
  open,
  onOpenChange,
}: {
  recipientId: string;
  recipientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "proposedTimes" });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/inbox/meeting-requests", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          recipientId,
          topic: values.topic,
          proposedTimes: values.proposedTimes.map((time) => new Date(time.value).toISOString()),
          message: values.message?.trim() ? values.message.trim() : null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.",
        );
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setError(null);
          setSent(false);
          form.reset(DEFAULT_VALUES);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a meeting with {recipientName}</DialogTitle>
          <DialogDescription>
            Sends a structured request to their Inbox — they can accept, decline, or propose a new time.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Meeting request sent to {recipientName}.</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Case review, career advice…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <FormLabel>Proposed times</FormLabel>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => append({ value: "" })}
                  >
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

              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send request"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
