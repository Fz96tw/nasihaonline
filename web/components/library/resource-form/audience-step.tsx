"use client";

import type { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KnowledgeVisibility } from "@/lib/generated/prisma/enums";
import type { CreateKnowledgeItemValues } from "@/lib/validation/knowledge";
import { InviteePicker } from "@/components/members/invitee-picker";
import { VISIBILITY_LABELS } from "./shared";

/** "Audience" section of the resource form: who can see it, who is invited, and the licensing consent. Only rendered while the item is still a first submission. */
export function AudienceStep({
  form,
  currentUserId,
}: {
  form: UseFormReturn<CreateKnowledgeItemValues>;
  currentUserId?: string;
}) {
  const isRestricted = form.watch("visibility") === KnowledgeVisibility.restricted;

  return (
    <section className="flex flex-col gap-5 border-t pt-6">
      <h2 className="text-base font-semibold">Audience &amp; visibility</h2>
      <FormField
        control={form.control}
        name="visibility"
        render={({ field }) => (
          <FormItem className="rounded-md border p-4">
            <FormLabel>Access</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {Object.values(KnowledgeVisibility).map((value) => (
                  <SelectItem key={value} value={value}>
                    {VISIBILITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              {isRestricted
                ? "Once published, only you and the invited members below can view this resource."
                : "Once published, visible to every member in the Library."}
            </FormDescription>
          </FormItem>
        )}
      />

      {isRestricted && (
        <FormField
          control={form.control}
          name="invitedUserIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invited members</FormLabel>
              <FormControl>
                <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="licenseConsented"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border p-4">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
            </FormControl>
            <div className="space-y-1">
              <FormLabel className="!mt-0">
                I retain ownership of what I submit, and grant NASIHA a non-exclusive right to display it to the
                membership.
              </FormLabel>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />
    </section>
  );
}
