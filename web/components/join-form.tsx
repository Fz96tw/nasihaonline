"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { CODE_OF_CONDUCT_PRINCIPLES } from "@/lib/legal";
import { AdmissionPhase, HowHeardSource, Tier } from "@/lib/generated/prisma/enums";
import { ADMISSION_PHASE_LABELS } from "@/lib/admission-phase";
import { getCsrfToken } from "@/lib/csrf-client";
import { TIER_LABELS } from "@/lib/validation/application-review";
import {
  applicationSchema,
  type ApplicationFormValues,
  HOW_HEARD_LABELS,
} from "@/lib/validation/application";

const emptyValues: ApplicationFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  professionalTitle: "",
  linkedinUrl: "",
  countryRegion: "",
  requestedTier: "",
  howHeardSource: "" as HowHeardSource,
  howHeardMemberName: "",
  howHeardOtherDetail: "",
  codeOfConductAccepted: false,
  emailUpdatesOptIn: true,
};

export function JoinForm({ phase }: { phase: AdmissionPhase }) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: emptyValues,
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const howHeardSource = form.watch("howHeardSource");

  async function onSubmit(values: ApplicationFormValues) {
    setSubmitError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const emailError = body?.error?.fieldErrors?.email?.[0];
        if (emailError) {
          form.setError("email", { message: emailError });
          return;
        }
        throw new Error("Submission failed");
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Something went wrong submitting your application. Please try again.");
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl rounded-[10px] border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Application submitted</h1>
        <p className="mt-2 text-muted-foreground">
          Application submitted — the Board will review within 7 days. Check your email
          for a confirmation. If approved, you&rsquo;ll be notified of the membership tier
          you&rsquo;ve been assigned, and you can finish setting up your full profile once
          you sign in.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto flex max-w-xl flex-col gap-6 p-8"
        noValidate
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Membership Application</h1>
          <p className="text-sm text-muted-foreground">
            Current Phase:{" "}
            <span className="font-medium text-foreground">{ADMISSION_PHASE_LABELS[phase]}</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Just a few details to get your application started — you&rsquo;ll fill in the rest
            of your profile (career stage, interests, expertise, and more) after you&rsquo;re
            approved and sign in for the first time.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input placeholder="Sarah" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input placeholder="Al-Rashidi" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@hospital.org" {...field} />
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
          name="countryRegion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country / Region</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Pakistan, United Kingdom, Nigeria" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="professionalTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Professional title / Specialty (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Cardiologist, Medical Student, Public Health Researcher"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="linkedinUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>LinkedIn profile (optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://linkedin.com/in/…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="requestedTier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Which tier are you hoping for? (optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(Tier).map((value) => (
                    <SelectItem key={value} value={value}>
                      {TIER_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Just a preference to help the Board — it doesn&rsquo;t guarantee that tier.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="howHeardSource"
          render={({ field }) => (
            <FormItem>
              <FormLabel>How did you hear about NASIHA?</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(HowHeardSource).map((value) => (
                    <SelectItem key={value} value={value}>
                      {HOW_HEARD_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {howHeardSource === HowHeardSource.member && (
          <FormField
            control={form.control}
            name="howHeardMemberName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Which member referred you?</FormLabel>
                <FormControl>
                  <Input placeholder="Name of the NASIHA member" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {howHeardSource === HowHeardSource.other && (
          <FormField
            control={form.control}
            name="howHeardOtherDetail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tell us more</FormLabel>
                <FormControl>
                  <Input placeholder="How did you hear about us?" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="codeOfConductAccepted"
          render={({ field }) => (
            <FormItem>
              <div className="rounded-[10px] border p-4">
                <p className="text-sm font-medium">Code of Conduct</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {CODE_OF_CONDUCT_PRINCIPLES.map((principle) => (
                    <li key={principle}>{principle}</li>
                  ))}
                </ul>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <span>I have read and agree to uphold the NASIHA Code of Conduct.</span>
                </label>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Submitting…" : "Submit Application"}
        </Button>
      </form>
    </Form>
  );
}
