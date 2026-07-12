"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ProfilePhotoUpload } from "@/components/profile/profile-photo-upload";
import { SkillPicker, type SkillOption } from "@/components/profile/skill-picker";
import {
  profileFormSchema,
  splitList,
  type ProfileFormValues,
} from "@/lib/validation/profile";
import { getCsrfToken } from "@/lib/csrf-client";

export function ProfileForm({
  email,
  avatarUrl,
  defaultValues,
  availableSkills,
}: {
  email: string;
  avatarUrl: string | null;
  defaultValues: ProfileFormValues;
  availableSkills: SkillOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
    mode: "onTouched",
  });

  async function onSubmit(values: ProfileFormValues) {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          name: values.name,
          bio: values.bio,
          countryRegion: values.countryRegion,
          titleSpecialty: values.titleSpecialty,
          careerStage: values.careerStage,
          skillIds: values.skillIds,
          expertiseAreas: splitList(values.expertiseAreas),
          learningTopics: splitList(values.learningTopics),
          listInDirectory: values.listInDirectory,
          showSpecialtyLocation: values.showSpecialtyLocation,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.",
        );
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
        <ProfilePhotoUpload name={form.watch("name") || "?"} avatarUrl={avatarUrl} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
            <div>
              <h2 className="font-bold">Personal Information</h2>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input value={email} disabled readOnly />
              </FormControl>
              <FormDescription>Synced from your account — cannot be edited here.</FormDescription>
            </FormItem>

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
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>

          <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
            <div>
              <h2 className="font-bold">Professional Information</h2>
            </div>

            <FormField
              control={form.control}
              name="titleSpecialty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title / Specialty</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Cardiologist, Medical Student" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="careerStage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Career Stage</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Practicing physician, Resident / Fellow" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="skillIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Areas of Expertise</FormLabel>
                  <FormControl>
                    <SkillPicker options={availableSkills} value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expertiseAreas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Other Expertise (not listed above)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="e.g. Regional dialect proficiency, niche subspecialty" {...field} />
                  </FormControl>
                  <FormDescription>Separate with commas.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="learningTopics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topics I Want to Learn</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="e.g. Oncology, Palliative Care" {...field} />
                  </FormControl>
                  <FormDescription>Separate with commas.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>
        </div>

        <section className="flex flex-col gap-4 rounded-[10px] border bg-card p-6 shadow-sm">
          <div>
            <h2 className="font-bold">Directory Visibility</h2>
            <p className="text-sm text-muted-foreground">
              Controls how you appear in the Member Directory.
            </p>
          </div>

          <FormField
            control={form.control}
            name="listInDirectory"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-4">
                <div>
                  <FormLabel>List me in Member Directory</FormLabel>
                  <FormDescription>
                    Turn this off to be excluded from the Directory entirely.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="showSpecialtyLocation"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-4">
                <div>
                  <FormLabel>Show my specialty and location</FormLabel>
                  <FormDescription>
                    When off, your title/specialty and country/region are hidden from your
                    Directory card.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </section>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && !error && <p className="text-sm text-success">Profile saved.</p>}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save Profile"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
