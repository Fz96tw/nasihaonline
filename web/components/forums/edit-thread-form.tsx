"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { updateForumThreadSchema, type UpdateForumThreadValues } from "@/lib/validation/forum";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";
import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";
import { CLINICAL_DISCUSSIONS_SLUG, type ForumCategory } from "@/lib/forums";
import type { KnowledgeCategoryOption } from "@/lib/library";
import { ThreadDestinationPicker, ThreadTopicsCheckboxes } from "@/components/forums/thread-classification-fields";

/**
 * "Edit Thread" form (title, audience, "Post to"/"Category" destination and
 * Topics — body editing lives inline in
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
 *
 * The destination pickers only render when the thread's current forum is
 * among `forums` (the forums the editor may post to) — otherwise there'd be
 * no chip to show as selected. Moving into Clinical Discussions asks for the
 * same de-identification confirmation as starting a thread there.
 */
export function EditThreadForm({
  threadId,
  currentUserId,
  forums,
  categories,
  communities,
  myCommunityIds,
  existingThread,
}: {
  threadId: string;
  currentUserId: string;
  /** Every forum the editor may post to — drives the destination pickers. */
  forums: ForumCategory[];
  categories: KnowledgeCategoryOption[];
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
  existingThread: {
    title: string;
    visibility: ForumThreadVisibility;
    invitedUserIds: string[];
    forumId: string;
    forumSlug: string;
    categoryIds: string[];
  };
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadyRestricted = existingThread.visibility === ForumThreadVisibility.invited;

  const form = useForm<UpdateForumThreadValues>({
    resolver: zodResolver(updateForumThreadSchema),
    defaultValues: {
      title: existingThread.title,
      visibility: existingThread.visibility,
      invitedUserIds: existingThread.invitedUserIds,
      forumId: existingThread.forumId,
      categoryIds: existingThread.categoryIds,
      deidentificationConfirmed: false,
    },
    mode: "onTouched",
  });

  const visibility = form.watch("visibility");
  const isRestricted = visibility === ForumThreadVisibility.invited;
  const forumId = form.watch("forumId");
  const canMove = forums.some((forum) => forum.id === existingThread.forumId);
  const selectedForum = forums.find((forum) => forum.id === forumId);
  const forumSlug = selectedForum?.slug ?? existingThread.forumSlug;
  const requireDeidentification = forumId !== existingThread.forumId && forumSlug === CLINICAL_DISCUSSIONS_SLUG;
  // Pre-check the communities the thread's existing Topics belong to, so a
  // general-forum thread's current tags are visible without extra clicks.
  const [initialTopicCommunityIds] = useState(() =>
    Array.from(
      new Set([
        ...myCommunityIds,
        ...categories.filter((c) => existingThread.categoryIds.includes(c.id)).map((c) => c.communityId),
      ]),
    ),
  );

  function selectForum(nextForumId: string) {
    form.setValue("forumId", nextForumId, { shouldDirty: true });
    // Tags belong to a community, so a prior selection may not apply to the
    // new destination.
    if (selectedForum && forums.find((f) => f.id === nextForumId)?.communityId !== selectedForum.communityId) {
      form.setValue("categoryIds", [], { shouldDirty: true });
    }
  }

  async function onSubmit(values: UpdateForumThreadValues) {
    if (requireDeidentification && !values.deidentificationConfirmed) {
      form.setError("deidentificationConfirmed", {
        message: "You must confirm all patient information has been de-identified.",
      });
      return;
    }

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
      // Replace (not push) this edit page's history entry with the thread
      // page, so BackLink's router.back() on the thread page can't land
      // back on it.
      router.replace(`/forums/${forumSlug}/${threadId}?saved=1`);
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
        {canMove && (
          <ThreadDestinationPicker forums={forums} communities={communities} forumId={forumId} onSelectForum={selectForum} />
        )}

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

        <FormField
          control={form.control}
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topics (optional)</FormLabel>
              <ThreadTopicsCheckboxes
                categories={categories}
                communities={communities}
                forumCommunityId={selectedForum?.communityId ?? null}
                initialCommunityIds={initialTopicCommunityIds}
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {requireDeidentification && (
          <FormField
            control={form.control}
            name="deidentificationConfirmed"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="!mt-0">I confirm all patient information in this thread has been de-identified</FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        )}

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
