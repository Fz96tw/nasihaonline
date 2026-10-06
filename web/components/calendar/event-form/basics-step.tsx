"use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventType } from "@/lib/generated/prisma/enums";
import { EVENT_TYPE_LABELS } from "@/lib/events";
import type { CreateEventValues } from "@/lib/validation/event";
import type { ExistingEvent } from "./shared";

/** "Basics" section of the event form: title, type, description, hero image. */
export function BasicsStep({
  form,
  existingEvent,
  heroImage,
  setHeroImage,
}: {
  form: UseFormReturn<CreateEventValues>;
  existingEvent?: ExistingEvent;
  heroImage: File | null;
  setHeroImage: (file: File | null) => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">Basics</h2>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Cardiology Update 2026" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Type</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {Object.values(EventType).map((value) => (
                  <SelectItem key={value} value={value}>
                    {EVENT_TYPE_LABELS[value]}
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
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description (optional)</FormLabel>
            <FormControl>
              <Textarea
                rows={4}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="hero-image" className="text-sm font-medium">
          Hero image (optional)
        </label>
        {existingEvent?.heroImageUrl && !heroImage && (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
          <img
            src={existingEvent.heroImageUrl}
            alt="Current hero image"
            className="h-32 w-full max-w-xs rounded-md object-cover"
          />
        )}
        <input
          id="hero-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
        />
        {existingEvent?.heroImageUrl && (
          <p className="text-xs text-muted-foreground">Choose a new file to replace the current image.</p>
        )}
      </div>
    </section>
  );
}
