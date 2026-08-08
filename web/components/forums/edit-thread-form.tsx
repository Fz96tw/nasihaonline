"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { updateForumThreadSchema, type UpdateForumThreadValues } from "@/lib/validation/forum";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";
import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";

/**
 * "Edit Thread" form (title + audience only — body editing lives inline in
 * PostNode, forum-thread-view.tsx, shared with reply editing). Deliberately
 * separate from NewThreadForm: create-time bundles thread+opening-post into
 * one atomic write, but edit-time doesn't need to, and this form has no
 * body/de-identification fields at all.
 *
 * Once a thread is already `invited`, the Audience select is locked — the
 * server rejects switching back to `community`, and roster changes stay on
 * the existing ManageThreadInvitees panel below on the detail page, not
 * here. `invitedUserIds` is only ever submitted (and only matters) on a
 * fresh `community` -> `invited` switch.
 */
export function EditThreadForm({
  threadId,
  forumSlug,
  currentUserId,
  existingThread,
}: {
  threadId: string;
  forumSlug: string;
  currentUserId: string;
  existingThread: {
    title: string;
    visibility: ForumThreadVisibility;
    invitedUserIds: string[];
  };
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadyRestricted = existingThread.visibility === ForumThreadVisibility.invited;

  const form = useForm<UpdateForumThreadValues>({
    resolver: zodResolver(updateForumThreadSchema),
    defaultValues: existingThread,
    mode: "onTouched",
  });

  const visibility = form.watch("visibility");
  const isRestricted = visibility === ForumThreadVisibility.invited;

  async function onSubmit(values: UpdateForumThreadValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/threads/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : payload?.error
              ? JSON.stringify(payload.error)
              : "Something went wrong. Please try again.",
        );
      }
      router.push(`/forums/${forumSlug}/${threadId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem className="rounded-md border p-4">
              <FormLabel>Audience</FormLabel>
              <Select value={field.value} onValueChange={field.onChange} disabled={alreadyRestricted}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ForumThreadVisibility.community}>Everyone</SelectItem>
                  <SelectItem value={ForumThreadVisibility.invited}>Invite only</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {alreadyRestricted
                  ? "This thread is already Invite Only and can't be switched back to Everyone. Manage the invited list below."
                  : isRestricted
                    ? "Only you and the members you invite can see or reply to this thread."
                    : "Every member can see and reply to this thread."}
              </FormDescription>
            </FormItem>
          )}
        />

        {!alreadyRestricted && isRestricted && (
          <FormField
            control={form.control}
            name="invitedUserIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invited members</FormLabel>
                <FormControl>
                  <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
                </FormControl>
                <FormDescription>Each invited member gets a notification pointing them to the thread.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Approach to refractory hypertension" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
