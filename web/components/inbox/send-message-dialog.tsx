"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { sendMessageSchema, type SendMessageValues } from "@/lib/validation/inbox";
import { getCsrfToken } from "@/lib/csrf-client";

const DEFAULT_VALUES: SendMessageValues = {
  recipientId: null,
  subject: null,
  body: "",
  parentId: null,
};

/**
 * Compose UI opened from a Directory card's "Send Message" action (§4.7).
 * Always sends a new top-level thread (parentId null) — reply composition
 * lives in the Inbox detail pane, not here.
 */
export function SendMessageDialog({
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

  const form = useForm<SendMessageValues>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { ...DEFAULT_VALUES, recipientId },
    mode: "onTouched",
  });

  async function onSubmit(values: SendMessageValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/inbox/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          recipientId,
          subject: values.subject?.trim() ? values.subject.trim() : null,
          body: values.body,
          parentId: null,
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
          form.reset({ ...DEFAULT_VALUES, recipientId });
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {recipientName}</DialogTitle>
          <DialogDescription>
            Sends an asynchronous message to their Inbox — not a live chat.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Message sent to {recipientName}.</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject (optional)</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value ?? ""}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
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
                      <Textarea rows={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
