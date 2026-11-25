"use client";

import type { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KnowledgeVisibility } from "@/lib/generated/prisma/enums";
import type { CreateKnowledgeItemValues } from "@/lib/validation/knowledge";
import { InviteePicker } from "@/components/members/invitee-picker";
import { VISIBILITY_LABELS } from "./shared";

/**
 * "Audience" section of the resource form: who can see it, who is invited, and
 * the licensing consent. For a new item or a draft (`storedVisibility`
 * undefined) everything is editable, as at creation. For a submitted item only
 * the visibility select is editable, with a warning when it changes; the
 * invitee picker appears only when switching public → restricted (an
 * already-restricted item's list is managed from its detail page), and the
 * license consent, already given, isn't shown again.
 */
export function AudienceStep({
  form,
  currentUserId,
  storedVisibility,
  isPublished = false,
}: {
  form: UseFormReturn<CreateKnowledgeItemValues>;
  /** Excluded from the invitee picker — the item's contributor. */
  currentUserId?: string;
  storedVisibility?: KnowledgeVisibility;
  /** Published or flagged — changes take effect immediately. */
  isPublished?: boolean;
}) {
  const visibility = form.watch("visibility");
  const isRestricted = visibility === KnowledgeVisibility.restricted;
  const isFirstSubmission = storedVisibility === undefined;
  const changed = !isFirstSubmission && visibility !== storedVisibility;
  const showPicker = isRestricted && (isFirstSubmission || storedVisibility === KnowledgeVisibility.public);

  return (
    <section className="flex flex-col gap-5">
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
              {!isRestricted
                ? "Once published, visible to every member in the Library."
                : showPicker
                  ? "Once published, only you and the invited members below can view this resource."
                  : "Only the contributor and invited members can view this resource. Manage who's invited from the resource's page."}
            </FormDescription>
          </FormItem>
        )}
      />

      {changed && (
        <div
          role="alert"
          className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning"
        >
          {isRestricted ? (
            <>
              <p className="font-medium">Making this resource restricted</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Only the contributor and the members you invite below will be able to open it. Everyone else loses
                  access straight away, including to its discussion thread and any replies they posted there.
                </li>
                {isPublished && (
                  <>
                    <li>Members may already have read it or saved its link, and those links will stop working.</li>
                    <li>
                      Its public page is removed, but search engines can keep showing it for a while until they re-check
                      it.
                    </li>
                    <li>The invited members will get a notification and an email.</li>
                  </>
                )}
              </ul>
            </>
          ) : (
            <>
              <p className="font-medium">Making this resource public</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  {isPublished
                    ? "Every member will be able to find and open it, and so can anyone on the web, including visitors who aren't signed in and search engines."
                    : "Once published, every member will be able to find and open it, and so can anyone on the web, including visitors who aren't signed in and search engines."}
                </li>
                <li>Its discussion thread, if it has one, also becomes visible to every member.</li>
                <li>The invited-members list is cleared. No one is notified about the change.</li>
              </ul>
            </>
          )}
        </div>
      )}

      {showPicker && (
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

      {isFirstSubmission && (
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
      )}
    </section>
  );
}
