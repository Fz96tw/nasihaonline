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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TagPicker, type TagOption } from "@/components/tag-picker";
import { CODE_OF_CONDUCT_PRINCIPLES } from "@/lib/legal";
import {
  AdmissionPhase,
  CareerStage,
  ApplicationAvailability,
  AreaOfInterest,
  InterestArea,
  Tier,
} from "@/lib/generated/prisma/enums";
import { ADMISSION_PHASE_LABELS, professionalReferenceRequired } from "@/lib/admission-phase";
import { getCsrfToken } from "@/lib/csrf-client";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { INTEREST_AREA_LABELS } from "@/lib/interest-areas";
import {
  applicationSchema,
  type ApplicationFormValues,
  CAREER_STAGE_LABELS,
  AVAILABILITY_LABELS,
  AREA_OF_INTEREST_LABELS,
} from "@/lib/validation/application";

const INTEREST_AREA_OPTIONS: TagOption[] = Object.values(InterestArea).map((value) => ({
  id: value,
  name: INTEREST_AREA_LABELS[value],
}));

const emptyValues: ApplicationFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  professionalTitle: "",
  requestedTier: "",
  careerStage: "" as CareerStage,
  availability: [],
  areaOfInterest: [],
  interestAreas: [],
  countryRegion: "",
  referral: "",
  whyJoin: "",
  expertiseToShare: "",
  topicsToLearn: "",
  professionalReferenceName: "",
  professionalReferenceContact: "",
  codeOfConductAccepted: false,
  emailUpdatesOptIn: true,
};

export function JoinForm({ phase }: { phase: AdmissionPhase }) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const referenceRequired = professionalReferenceRequired(phase);

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema(phase)),
    defaultValues: emptyValues,
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const isFriendTier = form.watch("requestedTier") === Tier.friend;

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
          you&rsquo;ve been assigned.
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
            You can tell us which membership tier you&rsquo;re hoping for below, but it&rsquo;s
            only a preference — if approved, the Board makes the final call on your membership
            tier (Active, Associate, Student/Trainee, or Friend of NASIHA) based on your
            experience and availability.
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
          name="professionalTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Professional title / Specialty</FormLabel>
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
          name="careerStage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Career stage</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your career stage" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(CareerStage).map((value) => (
                    <SelectItem key={value} value={value}>
                      {CAREER_STAGE_LABELS[value]}
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
          name="availability"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Availability</FormLabel>
              <FormDescription>How can you participate? Select all that apply.</FormDescription>
              <div className="flex flex-col gap-2">
                {Object.values(ApplicationAvailability).map((value) => (
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
                    {AVAILABILITY_LABELS[value]}
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="areaOfInterest"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Area of interest</FormLabel>
              <FormDescription>Select all that apply.</FormDescription>
              <div className="flex flex-col gap-2">
                {Object.values(AreaOfInterest).map((value) => (
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
                    {AREA_OF_INTEREST_LABELS[value]}
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="interestAreas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interest areas (optional)</FormLabel>
              <FormDescription>
                Specific topics you&rsquo;d like to connect with others about.
              </FormDescription>
              <FormControl>
                <TagPicker
                  options={INTEREST_AREA_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  triggerLabel="Add an interest area…"
                  searchPlaceholder="Search interest areas…"
                  emptyText="No interest area found."
                />
              </FormControl>
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

        {!isFriendTier && (
          <FormField
            control={form.control}
            name="referral"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Referral (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Name of the NASIHA member who referred you" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!isFriendTier && (
          <FormField
            control={form.control}
            name="whyJoin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Why do you want to join NASIHA?</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us about yourself and what you hope to contribute to and learn from the community…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!isFriendTier && (
          <FormField
            control={form.control}
            name="expertiseToShare"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Areas of expertise you&rsquo;d like to share</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g. Cardiology, ECG interpretation, clinical research methodology…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="topicsToLearn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topics you most want to learn</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g. Oncology, palliative care, healthcare leadership…"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isFriendTier && (
          <div className="flex flex-col gap-4 rounded-[10px] border p-4">
            <div>
              <p className="text-sm font-medium">
                Professional reference {referenceRequired ? "" : "(optional for now)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {referenceRequired
                  ? "Required during the Open Applications phase: name and contact info of someone who can vouch for your professional standing."
                  : "Not required during the current phase, but collected now so it's already on file when Open Applications begins."}
              </p>
            </div>
            <FormField
              control={form.control}
              name="professionalReferenceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference name</FormLabel>
                  <FormControl>
                    <Input placeholder="Dr. Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="professionalReferenceContact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference contact info</FormLabel>
                  <FormControl>
                    <Input placeholder="Email or phone number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
