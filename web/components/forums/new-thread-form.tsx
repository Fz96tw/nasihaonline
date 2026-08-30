"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createForumThreadSchema, type CreateForumThreadValues } from "@/lib/validation/forum";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";
import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";
import { usePasteImageUpload } from "@/lib/use-paste-image-upload";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import type { KnowledgeCategoryOption } from "@/lib/library";
import { QuickRecordingPicker, type QuickRecordingListItem } from "@/components/quick-recording-picker";

const DEFAULT_VALUES: CreateForumThreadValues = {
  title: "",
  body: "",
  deidentificationConfirmed: false,
  visibility: ForumThreadVisibility.community,
  invitedUserIds: [],
  categoryIds: [],
};

/**
 * The "Post" body Textarea, split out so usePasteImageUpload (a hook) is
 * called at a real component's top level rather than inside FormField's
 * render-prop callback.
 */
function ThreadBodyField({
  field,
  onImageUploadStateChange,
}: {
  field: ControllerRenderProps<CreateForumThreadValues, "body">;
  onImageUploadStateChange: (uploading: boolean) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCaret = useCallback(
    (markdown: string) => {
      const caret = textareaRef.current?.selectionStart ?? field.value.length;
      field.onChange(`${field.value.slice(0, caret)}${markdown}${field.value.slice(caret)}`);
    },
    [field],
  );

  const pasteImage = usePasteImageUpload({
    uploadUrl: "/api/forums/post-image",
    value: field.value,
    onInserted: insertAtCaret,
  });

  useEffect(() => {
    onImageUploadStateChange(pasteImage.uploading);
  }, [pasteImage.uploading, onImageUploadStateChange]);

  function insertVideo(recording: QuickRecordingListItem) {
    insertAtCaret(`![${recording.topic}](/api/inbox/meeting-requests/${recording.meetingRequestId}/recording/${recording.id})`);
  }

  return (
    <>
      <div className="mb-2">
        <QuickRecordingPicker onSelect={insertVideo} triggerLabel="Insert a video…" allowRecordNew={false} />
      </div>
      <Textarea
        rows={6}
        name={field.name}
        value={field.value}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        onPaste={pasteImage.onPaste}
        ref={(el) => {
          textareaRef.current = el;
          field.ref(el);
        }}
      />
      {pasteImage.uploading && <p className="mt-1 text-xs text-muted-foreground">Uploading image…</p>}
      {pasteImage.error && <p className="mt-1 text-xs text-destructive">{pasteImage.error}</p>}
    </>
  );
}

/**
 * "New Thread" form (§4.13), posted from /forums/[category]/new. The
 * de-identification checkbox only renders (and is only required) when
 * requireDeidentification is set — driven by the forum being Clinical
 * Discussions, same conditional-gate shape as SubmitResourceForm's
 * case_study checkbox. Both gates are enforced again server-side by
 * createForumThread.
 *
 * Member-Initiated Restricted Forum Threads (§4.13/§11.16) — the Audience
 * select + InviteePicker follow the exact same conditional-gate shape as
 * SubmitEventForm's restricted-audience toggle.
 */
export function NewThreadForm({
  forumId,
  forumSlug,
  requireDeidentification,
  currentUserId,
  categories,
  communities,
  communityId,
  myCommunityIds,
}: {
  forumId: string;
  forumSlug: string;
  requireDeidentification: boolean;
  currentUserId: string;
  categories: KnowledgeCategoryOption[];
  communities: { id: string; name: string }[];
  communityId: string | null;
  myCommunityIds: string[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  // Communities aren't a submitted field here (a thread's forum, not a
  // community list, is the required top-level classification — see
  // createForumThreadSchema) so this is local UI state, not a form field.
  // Pre-checking the member's own communities preserves the old behavior of
  // surfacing their categories without extra clicks.
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>(myCommunityIds);

  const form = useForm<CreateForumThreadValues>({
    resolver: zodResolver(createForumThreadSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const visibility = form.watch("visibility");
  const isRestricted = visibility === ForumThreadVisibility.invited;

  async function onSubmit(values: CreateForumThreadValues) {
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
      const res = await fetch(`/api/forums/${forumId}/threads`, {
        method: "POST",
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
      const { id } = await res.json();
      router.push(`/forums/${forumSlug}/${id}`);
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
              <Select value={field.value} onValueChange={field.onChange}>
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
                {isRestricted
                  ? "Only you and the members you invite can see or reply to this thread."
                  : "Every member can see and reply to this thread."}
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
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Post</FormLabel>
              <FormControl>
                <ThreadBodyField field={field} onImageUploadStateChange={setImageUploading} />
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
              {communityId ? (
                // This forum already belongs to a single community, so
                // asking the member to pick a community again (via the
                // Accordion CategoryCheckboxField normally uses) would be
                // redundant — scope straight to that community's
                // categories as a flat checkbox list.
                <div className="flex flex-wrap gap-4 rounded-md border p-3">
                  {categories
                    .filter((category) => category.communityId === communityId)
                    .map((category) => (
                      <label key={category.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(category.id)}
                          onCheckedChange={() =>
                            field.onChange(
                              field.value.includes(category.id)
                                ? field.value.filter((id) => id !== category.id)
                                : [...field.value, category.id],
                            )
                          }
                        />
                        {category.name}
                      </label>
                    ))}
                </div>
              ) : (
                // No fixed community (a general forum) — let the member pick
                // which top-level communities they're posting about first,
                // then only show categories for the communities selected.
                // Same two-step shape as SubmitResourceForm/SubmitEventForm.
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-4 rounded-md border p-3">
                    {communities.map((community) => (
                      <label key={community.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedCommunityIds.includes(community.id)}
                          onCheckedChange={(checked) =>
                            setSelectedCommunityIds((prev) =>
                              checked ? [...prev, community.id] : prev.filter((id) => id !== community.id),
                            )
                          }
                        />
                        {community.name}
                      </label>
                    ))}
                  </div>
                  {selectedCommunityIds.length > 0 && (
                    <CategoryCheckboxField
                      categories={categories.filter((category) => selectedCommunityIds.includes(category.communityId))}
                      communities={communities.filter((community) => selectedCommunityIds.includes(community.id))}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                </div>
              )}
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
                  <FormLabel className="!mt-0">I confirm all patient information has been de-identified</FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Button type="submit" disabled={submitting || imageUploading}>
            {submitting ? "Posting…" : "Start Thread"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
