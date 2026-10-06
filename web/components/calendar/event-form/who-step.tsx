"use client";

import type { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventVisibility } from "@/lib/generated/prisma/enums";
import type { EventCategoryOption, EventCommunityOption } from "@/lib/events";
import type { CreateEventValues } from "@/lib/validation/event";
import { InviteePicker } from "@/components/members/invitee-picker";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import { AUDIENCE_DESCRIPTIONS, AUDIENCE_LABELS, type AudienceChoice } from "./shared";

/** "Who" section of the event form: audience, invitees, communities, categories, public/guest-link toggles. */
export function WhoStep({
  form,
  isFirstSubmission,
  currentUserId,
  canTargetAllCommunities,
  communities,
  categories,
}: {
  form: UseFormReturn<CreateEventValues>;
  isFirstSubmission: boolean;
  currentUserId?: string;
  canTargetAllCommunities: boolean;
  communities: EventCommunityOption[];
  categories: EventCategoryOption[];
}) {
  const isRestricted = form.watch("visibility") === EventVisibility.invited;
  const isOpen = form.watch("open");
  const selectedCommunityIds = form.watch("communityIds");
  const allCommunities = form.watch("allCommunities");

  const audience: AudienceChoice = isRestricted ? "invited" : isOpen ? "open" : "community";
  function handleAudienceChange(value: AudienceChoice) {
    form.setValue("visibility", value === "invited" ? EventVisibility.invited : EventVisibility.community, {
      shouldDirty: true,
    });
    form.setValue("open", value === "open", { shouldDirty: true });
  }

  return (
    <section className="flex flex-col gap-5 border-t pt-6">
      <h2 className="text-base font-semibold">Who</h2>
      {isFirstSubmission && (
        <FormItem className="rounded-md border p-4">
          <FormLabel>Audience</FormLabel>
          <Select value={audience} onValueChange={handleAudienceChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {(Object.keys(AUDIENCE_LABELS) as AudienceChoice[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {AUDIENCE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>{AUDIENCE_DESCRIPTIONS[audience]}</FormDescription>
        </FormItem>
      )}

      {isFirstSubmission && isRestricted && (
        <FormField
          control={form.control}
          name="invitedUserIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Invited members</FormLabel>
              <FormControl>
                <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
              </FormControl>
              <FormDescription>
                Each invited member gets a notification and email asking them to RSVP.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="communityIds"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Communities</FormLabel>
            <FormControl>
              <div className="flex flex-wrap gap-4 rounded-md border p-3">
                {canTargetAllCommunities && (
                  <label className="flex w-full items-center gap-2 border-b pb-3 text-sm font-medium">
                    <Checkbox
                      checked={allCommunities}
                      onCheckedChange={(checked) => {
                        form.setValue("allCommunities", checked === true, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        if (checked === true) {
                          field.onChange([]);
                          form.setValue("categoryIds", []);
                        }
                      }}
                    />
                    All communities (shows on every member&apos;s feed)
                  </label>
                )}
                {communities.map((community) => (
                  <label key={community.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={allCommunities}
                      checked={field.value.includes(community.id)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, community.id]
                            : field.value.filter((id) => id !== community.id),
                        )
                      }
                    />
                    {community.name}
                  </label>
                ))}
              </div>
            </FormControl>
            <FormDescription>Select at least one community this event belongs to.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {!allCommunities && selectedCommunityIds.length > 0 && (
        <FormField
          control={form.control}
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categories (optional)</FormLabel>
              <FormControl>
                <CategoryCheckboxField
                  categories={categories.filter((category) => selectedCommunityIds.includes(category.communityId))}
                  communities={communities.filter((community) => selectedCommunityIds.includes(community.id))}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* isFirstSubmission (brand-new, or a still-draft event) sets `open`
        via the Audience selector above. Visibility itself can't change
        past a draft's first publish (see updateEvent), but a community
        event's `open` flag still can — this is that later-edit
        equivalent of the same setting. */}
      {!isFirstSubmission && !isRestricted && (
        <FormField
          control={form.control}
          name="open"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-4">
              <div>
                <FormLabel>Open to the public</FormLabel>
                <FormDescription>Off keeps this event members-only; listed on /events either way.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {/* Private guest-invite link — only for a public event. Off by default;
        the link itself, "Regenerate" and email invitations live on the
        event's detail page once it's saved and published. */}
      {isOpen && !isRestricted && (
        <FormField
          control={form.control}
          name="guestLinkEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-4">
              <div>
                <FormLabel>Allow guests with a private link</FormLabel>
                <FormDescription>
                  Lets you share a private link, or email invitations, so non-members can join without registering
                  first. Manage it from the event page after you save.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      )}
    </section>
  );
}
