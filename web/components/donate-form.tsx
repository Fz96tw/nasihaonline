"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { getCsrfToken } from "@/lib/csrf-client";
import { DonationFrequency } from "@/lib/generated/prisma/enums";
import { donationSchema, type DonationFormValues } from "@/lib/validation/donation";
import { CODE_OF_CONDUCT_PRINCIPLES } from "@/lib/legal";

const FREQUENCY_LABELS: Record<DonationFrequency, string> = {
  [DonationFrequency.one_time]: "One-time",
  [DonationFrequency.recurring]: "Monthly",
};

const AMOUNT_PRESETS = [10, 25, 50, 100];

export function DonateForm({
  defaultName,
  defaultEmail,
  canceled,
}: {
  defaultName?: string;
  defaultEmail?: string;
  canceled?: boolean;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<DonationFormValues>({
    resolver: zodResolver(donationSchema),
    defaultValues: {
      donorName: defaultName ?? "",
      donorEmail: defaultEmail ?? "",
      amount: 50,
      frequency: DonationFrequency.one_time,
      recognitionConsent: true,
      emailUpdatesOptIn: true,
      friendApplicationOptIn: true,
      note: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: DonationFormValues) {
    setSubmitError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Checkout session creation failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setSubmitError("Something went wrong starting your donation. Please try again.");
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto flex max-w-xl flex-col gap-6 p-8"
        noValidate
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Support NASIHA</h1>
          <p className="text-sm text-muted-foreground">
            Donations fund the Organization directly and are entirely separate from the
            Knowledge Hours exchange — donating never confers Knowledge Hours or membership
            advantage.
          </p>
        </div>

        {canceled && (
          <p className="rounded-[10px] border bg-muted p-3 text-sm text-muted-foreground">
            Checkout was canceled — no charge was made.
          </p>
        )}

        <FormField
          control={form.control}
          name="frequency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Frequency</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(DonationFrequency).map((value) => (
                    <SelectItem key={value} value={value}>
                      {FREQUENCY_LABELS[value]}
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
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount (USD)</FormLabel>
              <div className="flex flex-wrap gap-2">
                {AMOUNT_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    className={cn(
                      Number(field.value) === preset &&
                        "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    )}
                    onClick={() => field.onChange(preset)}
                  >
                    ${preset}
                  </Button>
                ))}
              </div>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  inputMode="decimal"
                  placeholder="Custom amount"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="donorName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Sarah Al-Rashidi" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="donorEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
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
                <Textarea placeholder="e.g. In honor of..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="emailUpdatesOptIn"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-start gap-2 text-sm">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <span>
                  Keep me updated with NASIHA news, event announcements, and other important
                  communications by email.
                </span>
              </label>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="recognitionConsent"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-start gap-2 text-sm">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <span>
                  I&rsquo;m open to being publicly recognized as a donor (e.g. in the community
                  digest or annual report). Leave unchecked to give anonymously.
                </span>
              </label>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="friendApplicationOptIn"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-start gap-2 text-sm">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <span>
                  Also apply to become a <strong>Friend of NASIHA</strong> member — free access
                  to public events, recordings, and community updates, with no separate
                  application to fill out. Your application will still be reviewed by the Board
                  before it&rsquo;s approved. By checking this box you agree to the NASIHA Code
                  of Conduct:
                </span>
              </label>
              {field.value && (
                <ul className="ml-8 mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {CODE_OF_CONDUCT_PRINCIPLES.map((principle) => (
                    <li key={principle}>{principle}</li>
                  ))}
                </ul>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Redirecting to checkout…" : "Donate"}
        </Button>
      </form>
    </Form>
  );
}
