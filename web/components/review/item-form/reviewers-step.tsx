"use client";

import type { UseFormReturn } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewItemForEdit } from "@/lib/review";
import type { CreateReviewItemValues } from "@/lib/validation/review";
import { InviteePicker } from "@/components/members/invitee-picker";

/** "Reviewers" section of the peer-review item form: who to ask for feedback (a fixed invite list or an open call) and the volunteer note. */
export function ReviewersStep({
  form,
  existingItem,
  currentUserId,
}: {
  form: UseFormReturn<CreateReviewItemValues>;
  existingItem?: ReviewItemForEdit;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
}) {
  const isInviteMode = form.watch("audienceMode") === "invite";
  // Volunteer note only ever makes sense for an open call: at creation
  // that's the "Request Volunteers" toggle; once submitted, seekingReviewers
  // is fixed (this form doesn't expose changing it), so edit mode keys off
  // the existing item's own value instead.
  const showVolunteerNote = existingItem ? existingItem.seekingReviewers : !isInviteMode;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">Reviewers</h2>
      {!existingItem && (
        <FormField
          control={form.control}
          name="audienceMode"
          render={({ field }) => (
            <FormItem className="rounded-md border p-4">
              <FormLabel>Reviewers</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="invite">Select Reviewers</SelectItem>
                  <SelectItem value="volunteers">Request Volunteers</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {isInviteMode
                  ? "Pick specific members you'd like feedback from."
                  : "Open a call to the whole community — anyone can offer to review, and you choose who to accept."}
              </FormDescription>
            </FormItem>
          )}
        />
      )}

      {!existingItem && isInviteMode && (
        <FormField
          control={form.control}
          name="invitedUserIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reviewers</FormLabel>
              <FormControl>
                <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {showVolunteerNote && (
        <FormField
          control={form.control}
          name="volunteerNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What kind of feedback are you looking for? (optional)</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </section>
  );
}
