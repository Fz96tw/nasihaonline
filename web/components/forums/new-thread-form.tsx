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
import type { KnowledgeCategoryOption } from "@/lib/library";
import { hasVideoToken } from "@/lib/linkify";
import { QuickRecordingPicker, type QuickRecordingListItem } from "@/components/quick-recording-picker";
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "@/lib/local-draft";
import { CLINICAL_DISCUSSIONS_SLUG, type ForumCategory } from "@/lib/forums";
import { ThreadDestinationPicker, ThreadTopicsCheckboxes } from "@/components/forums/thread-classification-fields";

const DEFAULT_VALUES: CreateForumThreadValues = {
  title: "",
  body: "",
  deidentificationConfirmed: false,
  visibility: ForumThreadVisibility.community,
  invitedUserIds: [],
  categoryIds: [],
};

const BODY_PLACEHOLDER = [
  "Share the details here, for example:",
  "• The situation or question, with relevant background",
  "• What you've already tried or considered",
  "• What kind of input would help most",
  "",
  "Tip: you can copy or cut an image and paste it straight into this box to include it.",
].join("\n");

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
      {!hasVideoToken(field.value) && (
        <div className="mb-2">
          <QuickRecordingPicker onSelect={insertVideo} triggerLabel="Insert a video…" allowRecordNew={false} />
        </div>
      )}
      <Textarea
        rows={8}
        placeholder={BODY_PLACEHOLDER}
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
  forumId: initialForumId,
  forums,
  currentUserId,
  categories,
  communities,
  myCommunityIds,
  variant = "forum",
}: {
  /**
   * "post" is the feed-style composer at /post/new: no forum/thread wording,
   * chip pickers for destination, and a redirect back to the feed. "forum"
   * is the original fixed-forum form at /forums/[category]/new.
   */
  variant?: "forum" | "post";
  forumId: string;
  /** Every forum the member may post to — drives the destination selector. */
  forums: ForumCategory[];
  currentUserId: string;
  categories: KnowledgeCategoryOption[];
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
}) {
  // The destination can be changed in-form, so forum-derived values are
  // state-driven rather than props. The draft key below stays pinned to the
  // initial forum so a mid-draft switch doesn't orphan what's been typed.
  const [forumId, setForumId] = useState(initialForumId);
  const selectedForum = forums.find((forum) => forum.id === forumId) ?? forums[0];
  const forumSlug = selectedForum.slug;
  const communityId = selectedForum.communityId;
  const requireDeidentification = forumSlug === CLINICAL_DISCUSSIONS_SLUG;
  const isPost = variant === "post";
  const noun = isPost ? "post" : "thread";
  const audienceName = communityId === null ? null : (communities.find((c) => c.id === communityId)?.name ?? null);
  function selectForum(nextForumId: string) {
    setForumId(nextForumId);
    // Tags belong to a community, so a prior selection may not apply to the
    // new destination.
    form.setValue("categoryIds", [], { shouldDirty: true });
  }
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const form = useForm<CreateForumThreadValues>({
    resolver: zodResolver(createForumThreadSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const visibility = form.watch("visibility");
  const isRestricted = visibility === ForumThreadVisibility.invited;

  // Autosave to localStorage, scoped per forum — a lightweight recovery net
  // for "closed the tab mid-post," distinct from the server-side Save as
  // Draft feature Library/Events have. Only title+body (the free-text
  // fields actually worth recovering); structured selections like
  // categoryIds aren't restored. See lib/local-draft.ts.
  const draftKey = `forum-new-thread-draft:${initialForumId}`;
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    const saved = readLocalDraft<{ title: string; body: string }>(draftKey);
    if (saved && (saved.title || saved.body)) {
      form.setValue("title", saved.title, { shouldDirty: true });
      form.setValue("body", saved.body, { shouldDirty: true });
      setDraftRestored(true);
    }
    // Only ever meant to run once, on mount — re-running on every draftKey
    // identity (it's a fresh string each render) would refight the user's
    // own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = form.watch((values) => {
      if (values.title || values.body) {
        writeLocalDraft(draftKey, { title: values.title ?? "", body: values.body ?? "" });
      } else {
        clearLocalDraft(draftKey);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  function discardDraft() {
    clearLocalDraft(draftKey);
    form.setValue("title", "", { shouldDirty: true });
    form.setValue("body", "", { shouldDirty: true });
    setDraftRestored(false);
  }

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
      clearLocalDraft(draftKey);
      router.push(isPost ? "/whats-new" : `/forums/${forumSlug}/${id}`);
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
        {draftRestored && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <span>Restored your unsaved draft.</span>
            <button type="button" onClick={discardDraft} className="text-primary hover:underline">
              Discard
            </button>
          </div>
        )}

        {isPost && (
          <ThreadDestinationPicker forums={forums} communities={communities} forumId={forumId} onSelectForum={selectForum} />
        )}

        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem className="rounded-md border p-4">
              <FormLabel>{isPost ? "Visibility" : "Audience"}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ForumThreadVisibility.community}>
                    {isPost && audienceName ? `All ${audienceName} members` : "Everyone"}
                  </SelectItem>
                  <SelectItem value={ForumThreadVisibility.invited}>
                    {isPost ? "Specific members only" : "Invite only"}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {isRestricted
                  ? `Only you and the members you ${isPost ? "choose" : "invite"} can see or reply to this ${noun}.`
                  : isPost && audienceName
                    ? `Every ${audienceName} member can see and reply to this post.`
                    : `Every member can see and reply to this ${noun}.`}
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
                <FormLabel>{isPost ? "Choose members" : "Invited members"}</FormLabel>
                <FormControl>
                  <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
                </FormControl>
                <FormDescription>Each member you {isPost ? "choose" : "invite"} gets a notification pointing them to the {noun}.</FormDescription>
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
              <FormLabel>{isPost ? "Headline" : "Title"}</FormLabel>
              <FormControl>
                <Input placeholder={isPost ? "What do you want to share?" : "e.g. Approach to refractory hypertension"} {...field} />
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
              <FormLabel>{isPost ? "Tags (optional)" : "Topics (optional)"}</FormLabel>
              <ThreadTopicsCheckboxes
                categories={categories}
                communities={communities}
                forumCommunityId={communityId}
                initialCommunityIds={myCommunityIds}
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
            {submitting ? "Posting…" : isPost ? "Post" : "Start Thread"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
