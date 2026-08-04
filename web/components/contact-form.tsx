"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { getCsrfToken } from "@/lib/csrf-client";
import { ContactService } from "@/lib/generated/prisma/enums";
import { CONTACT_SERVICE_LABELS, contactSchema, type ContactFormValues } from "@/lib/validation/contact";

export function ContactForm({
  defaultName,
  defaultEmail,
  showHeader = true,
}: {
  defaultName?: string;
  defaultEmail?: string;
  showHeader?: boolean;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: defaultName ?? "",
      email: defaultEmail ?? "",
      services: [],
      subject: "",
      message: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: ContactFormValues) {
    setSubmitError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (res.status === 429) {
        setSubmitError("Too many messages sent. Please try again later.");
        return;
      }
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      setSubmitError("Something went wrong sending your message. Please try again.");
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto my-12 max-w-xl rounded-[10px] border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Message sent</h1>
        <p className="mt-2 text-muted-foreground">
          Thanks for reaching out — we&rsquo;ll get back to you as soon as we can.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto my-12 flex max-w-xl flex-col gap-6 rounded-[10px] border bg-muted p-8 shadow-sm"
        noValidate
      >
        {showHeader && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contact Us</h1>
            <p className="text-sm text-muted-foreground">
              Questions, feedback, or partnership inquiries — we&rsquo;d love to hear from you.
            </p>
          </div>
        )}

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

        <FormField
          control={form.control}
          name="services"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Which of our services is this about?</FormLabel>
              <div className="flex flex-col gap-2">
                {Object.values(ContactService).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value.includes(value)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, value]
                            : field.value.filter((v) => v !== value)
                        )
                      }
                    />
                    {CONTACT_SERVICE_LABELS[value]}
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="What's this about?" {...field} />
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
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea rows={6} placeholder="How can we help?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Sending…" : "Send Message"}
        </Button>
      </form>
    </Form>
  );
}
