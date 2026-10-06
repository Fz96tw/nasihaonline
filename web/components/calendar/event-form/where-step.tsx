"use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventVisibility } from "@/lib/generated/prisma/enums";
import type { CreateEventValues } from "@/lib/validation/event";
import { InviteePicker } from "@/components/members/invitee-picker";
import type { ExistingEvent } from "./shared";

/** "Where" section of the event form: meeting platform/link, co-hosts, waiting-room message and image. */
export function WhereStep({
  form,
  existingEvent,
  isFirstSubmission,
  currentUserId,
  meetingOrganizerMessage,
  setMeetingOrganizerMessage,
  meetingOrganizerMessageImage,
  setMeetingOrganizerMessageImage,
}: {
  form: UseFormReturn<CreateEventValues>;
  existingEvent?: ExistingEvent;
  isFirstSubmission: boolean;
  currentUserId?: string;
  meetingOrganizerMessage: string;
  setMeetingOrganizerMessage: (message: string) => void;
  meetingOrganizerMessageImage: File | null;
  setMeetingOrganizerMessageImage: (file: File | null) => void;
}) {
  const isRestricted = form.watch("visibility") === EventVisibility.invited;
  const meetLinkSource = form.watch("meetLinkSource");

  return (
    <section className="flex flex-col gap-5 border-t pt-6">
      <h2 className="text-base font-semibold">Where</h2>
      <div className="flex flex-col gap-3">
        <FormField
          control={form.control}
          name="meetLinkSource"
          render={({ field }) => (
            <FormItem className="rounded-md border p-4">
              <FormLabel>Meeting link</FormLabel>
              <FormDescription>
                Nasiha Conference and Google Meet both auto-generate their own meeting link — or paste your own
                below. Nasiha Conference gives you real in-meeting host controls (admit, mute, or remove
                participants), and lets you and any co-hosts you name below start or stop recording. Google Meet
                does not record these meetings.
                {!isFirstSubmission && (
                  <span className="mt-1 block">
                    Switching platforms here replaces the current link with a brand-new one — you&apos;ll get a
                    chance to notify everyone who already has the old link once you save.
                  </span>
                )}
              </FormDescription>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livekit">Nasiha Conference</SelectItem>
                    <SelectItem value="auto">Google Meet</SelectItem>
                    <SelectItem value="manual">Paste my own link</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>
          )}
        />

        {isFirstSubmission && meetLinkSource === "livekit" && (
          <FormField
            control={form.control}
            name="coHostUserIds"
            render={({ field }) => (
              <FormItem className="rounded-md border p-4">
                <FormLabel>Co-hosts</FormLabel>
                <FormControl>
                  <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
                </FormControl>
                <FormDescription>
                  Co-hosts can start/stop recording and name further co-hosts, the same as you. You can also add or
                  remove co-hosts from the participant list once the meeting is underway.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {meetLinkSource === "manual" && (
          <FormField
            control={form.control}
            name="meetingUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meeting link{isRestricted ? "" : " (optional)"}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://meet.google.com/…"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormDescription>
                  {isRestricted ? "Shared with invited members." : "Only shown to members who RSVP."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="waiting-room-message" className="text-sm font-medium">
          Waiting room message (optional)
        </label>
        <p className="text-xs text-muted-foreground">
          Shown to attendees who join before you start the meeting, on the in-app waiting room page.
        </p>
        <Textarea
          id="waiting-room-message"
          rows={3}
          value={meetingOrganizerMessage}
          onChange={(e) => setMeetingOrganizerMessage(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="waiting-room-image" className="text-sm font-medium">
          Waiting room image (optional)
        </label>
        {existingEvent?.meetingOrganizerMessageImageUrl && !meetingOrganizerMessageImage && (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
          <img
            src={existingEvent.meetingOrganizerMessageImageUrl}
            alt="Current waiting room image"
            className="h-32 w-full max-w-xs rounded-md object-cover"
          />
        )}
        <input
          id="waiting-room-image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setMeetingOrganizerMessageImage(e.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
        />
        {existingEvent?.meetingOrganizerMessageImageUrl && (
          <p className="text-xs text-muted-foreground">Choose a new file to replace the current image.</p>
        )}
      </div>
    </section>
  );
}
