"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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

const formSchema = z.object({
  description: z.string().trim().min(1, "Describe the concern").max(2000),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = { description: "" };

/**
 * "Report" on a Directory card (§4.15): a concern about a member's conduct,
 * posted to POST /api/conduct/report for admin review at /admin/conduct.
 * Distinct from content-flagging — this is about the person, not a
 * specific post/item.
 */
export function ReportConductDialog({
  reportedUserId,
  reportedUserName,
  open,
  onOpenChange,
}: {
  reportedUserId: string;
  reportedUserName: string;
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

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/conduct/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ reportedUserId, description: values.description }),
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
          <DialogTitle>Report {reportedUserName}</DialogTitle>
          <DialogDescription>
            Describe the conduct concern. This goes to admins for review — it&apos;s never visible to
            other members.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Report submitted for admin review.</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What happened?</FormLabel>
                    <FormControl>
                      <Textarea rows={5} placeholder="Describe the concern…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit report"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
