"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { getCsrfToken } from "@/lib/csrf-client";
import { meetingPath, storeRid, useStoredRid } from "@/lib/event-registration-client";
import { eventRegistrationSchema, type EventRegistrationFormValues } from "@/lib/validation/event-registration";

type RegisterResult =
  | { registered: true; alreadyRegistered: true }
  | { registered: true; alreadyRegistered: false; registrationId: string; joinPath: string | null };

/**
 * "Register" CTA for a signed-out visitor on an `open` event (§4.6) — the
 * anonymous counterpart to RsvpButton. Captures name/email into
 * EventRegistration via POST /api/events/:id/register rather than an RSVP
 * row, since the visitor has no account.
 *
 * A FIRST registration for an email drops the visitor straight into the
 * meeting's waiting room (/meet/event/:id?rid=…) and remembers the rid in
 * this browser, after which this renders an "Open waiting room" / "Join Event"
 * link instead of the dialog. If the email was already registered the server
 * withholds the rid (it only goes out by email), so the dialog just says the
 * join link was re-sent. `label`/`started`/`icon`/`size` let the live-event
 * popup reuse it; the defaults are the original event-page button.
 */
export function RegisterButton({
  eventId,
  eventTitle,
  label = "Register to attend",
  joinLabel = "Join Event",
  variant,
  started = false,
  icon,
  size = "sm",
}: {
  eventId: string;
  eventTitle: string;
  label?: string;
  /** Text of the stored-link button once the host has started the meeting (default "Join Event"). */
  joinLabel?: string;
  /** Button style for the trigger / stored link (the live-event notices pass "live"). */
  variant?: ButtonProps["variant"];
  /** The host has started the meeting — the stored-link button then reads `joinLabel`. */
  started?: boolean;
  icon?: ReactNode;
  size?: "xs" | "sm" | "default";
}) {
  const router = useRouter();
  const storedRid = useStoredRid(eventId);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"registered" | "already" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<EventRegistrationFormValues>({
    resolver: zodResolver(eventRegistrationSchema),
    defaultValues: { name: "", email: "" },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: EventRegistrationFormValues) {
    setSubmitError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const result = (await res.json()) as RegisterResult;
      if (result.alreadyRegistered) {
        setOutcome("already");
        return;
      }
      if (result.joinPath) {
        storeRid(eventId, result.registrationId);
        router.push(result.joinPath);
        return;
      }
      setOutcome("registered");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (storedRid) {
    return (
      <Button size={size} variant={variant} asChild>
        <Link href={meetingPath(eventId, storedRid)}>
          {icon}
          {started ? joinLabel : "Open waiting room"}
        </Link>
      </Button>
    );
  }

  if (outcome) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        {outcome === "already"
          ? "You're already registered — we've re-sent your join link."
          : "You're registered — check your email."}
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant}>
          {icon}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register for {eventTitle}</DialogTitle>
          <DialogDescription>
            This event is open to the public — no NASIHA account needed. We&apos;ll email you a
            confirmation right away, including how to join.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
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
              name="email"
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

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Registering…" : "Register"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Shown above an open event's description for a signed-out visitor, so they know what Register does before clicking. */
export function RegisterBlurb({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      No NASIHA account needed. After you register, you will receive an email with the link to join the event. If you
      don&apos;t see it then check your spam folder.
    </p>
  );
}
