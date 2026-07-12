"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { CounterpartPicker } from "@/components/contributions/counterpart-picker";
import { logContributionSchema, type LogContributionValues } from "@/lib/validation/contribution";
import { type ContributionRuleOption } from "@/lib/contributions";
import { getCsrfToken } from "@/lib/csrf-client";

export function LogContributionDialog({ rules }: { rules: ContributionRuleOption[] }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<LogContributionValues>({
    resolver: zodResolver(logContributionSchema),
    defaultValues: { activityKey: "", counterpartUserId: null, note: null },
    mode: "onTouched",
  });

  async function onSubmit(values: LogContributionValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/contributions/earn", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          activityKey: values.activityKey,
          counterpartUserId: values.counterpartUserId,
          note: values.note?.trim() ? values.note.trim() : null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.",
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["contributions-history"] });
      form.reset({ activityKey: "", counterpartUserId: null, note: null });
      setOpen(false);
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
        setOpen(next);
        if (!next) {
          setError(null);
          form.reset({ activityKey: "", counterpartUserId: null, note: null });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Log Contribution</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Contribution</DialogTitle>
          <DialogDescription>
            Submit an activity for confirmation. It enters as pending and won&apos;t affect your balance
            until it&apos;s confirmed.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="activityKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activity</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an activity" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rules.map((rule) => (
                        <SelectItem key={rule.activityKey} value={rule.activityKey}>
                          {rule.label} ({rule.hours} hr{rule.hours === 1 ? "" : "s"})
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
              name="counterpartUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Counterpart (optional)</FormLabel>
                  <FormControl>
                    <CounterpartPicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    If named, they can confirm this directly. Otherwise it goes to admin review.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
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
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
