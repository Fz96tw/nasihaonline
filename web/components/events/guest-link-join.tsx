"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { getCsrfToken } from "@/lib/csrf-client";
import { meetingPath, storeRid, useStoredRid } from "@/lib/event-registration-client";
import { eventRegistrationSchema, type EventRegistrationFormValues } from "@/lib/validation/event-registration";
import { formatTimestamp } from "@/lib/format-date";

/**
 * Landing step for a host's private guest link (/meet/event/:id?gt=…): a
 * signed-out visitor gives a name and email (both required, on every
 * platform), the server creates their registration and hands back the join
 * credential, and they continue into the normal waiting room — which still
 * shows the Code of Conduct click-through before letting them into the call.
 *
 * A browser that already holds a registration for this event (from a prior
 * visit with this link, or from registering normally) skips the form. An
 * email that's already registered is never given its id here — it's emailed
 * instead — so that outcome just tells the visitor to check their inbox.
 */
export function GuestLinkJoin({
  eventId,
  token,
  title,
  startsAt,
  hostName,
}: {
  eventId: string;
  token: string;
  title: string;
  startsAt: string;
  hostName: string;
}) {
  const router = useRouter();
  const storedRid = useStoredRid(eventId);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailedLink, setEmailedLink] = useState(false);

  useEffect(() => {
    if (storedRid) router.replace(meetingPath(eventId, storedRid));
  }, [storedRid, eventId, router]);

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
      const res = await fetch(`/api/events/${eventId}/guest-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ token, ...values }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      if (payload.registrationId && payload.joinPath) {
        storeRid(eventId, payload.registrationId);
        router.push(payload.joinPath);
        return;
      }
      setEmailedLink(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{hostName} invited you to join</p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{formatTimestamp(startsAt)}</p>
      </div>

      {emailedLink ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          That email is already registered for this event, so we&apos;ve sent your personal join link to it. Open that
          email to join at the scheduled time.
        </p>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Joining…" : "Continue"}
            </Button>
            <p className="text-xs text-muted-foreground">
              We use your email to send your personal join link and a calendar invite for this event.
            </p>
          </form>
        </Form>
      )}
    </main>
  );
}
