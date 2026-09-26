"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { KnowledgeContentType, KnowledgeLevel, KnowledgeStatus, KnowledgeVisibility } from "@/lib/generated/prisma/enums";
import {
  CONTENT_TYPE_LABELS,
  LEVEL_LABELS,
  type KnowledgeCategoryOption,
  type KnowledgeItemForEdit,
  type KnowledgeTagOption,
} from "@/lib/library";
import {
  createKnowledgeItemSchema,
  draftKnowledgeItemSchema,
  updateKnowledgeItemSchema,
  type CreateKnowledgeItemValues,
} from "@/lib/validation/knowledge";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";
import { TiptapEditor } from "@/components/library/tiptap-editor";
import { DeleteLibraryItemButton } from "@/components/library/delete-library-item-button";

// Mirrors ALLOWED_DOCUMENT_MIME_TYPES in lib/storage.ts (uploadKnowledgeDocument,
// shared by Library and Peer Review) — a browser accept hint only, the
// server re-validates regardless. Video (mp4/webm/mov) has a higher size cap
// than documents (see MAX_VIDEO_UPLOAD_BYTES there).
const DOCUMENT_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,image/jpeg,image/png,image/webp,image/gif,image/bmp,video/mp4,video/webm,video/quicktime";

const DEFAULT_VALUES: CreateKnowledgeItemValues = {
  title: "",
  body: null,
  contentType: "" as KnowledgeContentType,
  level: null,
  communityIds: [],
  categoryIds: [],
  tagIds: [],
  youtubeUrl: null,
  externalUrl: null,
  deidentificationConfirmed: false,
  showTitleOverlay: false,
  licenseConsented: false,
  visibility: KnowledgeVisibility.public,
  invitedUserIds: [],
};

const VISIBILITY_LABELS: Record<KnowledgeVisibility, string> = {
  [KnowledgeVisibility.public]: "Public — visible to every member",
  [KnowledgeVisibility.restricted]: "Restricted — invited members only",
};

/**
 * "Submit Resource" form (§4.9), posted from /library/new, and reused from
 * /library/[id]/edit when `existingItem` is supplied. Keeps using
 * CreateKnowledgeItemValues as its RHF value type in every mode (rather than
 * a separate edit-mode type) — same simplification as WritePostForm. Every
 * content type shares one rich-text `body` field (TiptapEditor) right after
 * Title; the short `description` shown on cards/search is always derived
 * from it server-side (excerptFromHtml), never typed here. contentType then
 * drives the remaining source-specific field, mutually exclusive with body:
 * a YouTube URL input for recorded_lecture, a `sourceMode` toggle between a
 * file input and an `externalUrl` input for every other non-blog type
 * (mutually exclusive — toggling clears the other, with an edit able to
 * leave the existing attachment in place instead of replacing it), or
 * nothing extra for blog_post (its content is fully covered by body).
 * case_study additionally requires the de-identification checkbox,
 * re-affirmed on every edit rather than carried forward silently.
 *
 * Restricted Knowledge Library Submissions, Objective 03: `visibility` is a
 * 2-way choice (public / restricted), mirroring SubmitEventForm's audience
 * picker — normally create-only (edit mode hides the section and always
 * submits it as public with no invitees, since editing an already-submitted
 * item can't change it), EXCEPT while `existingItem.status === draft`: a
 * draft's real first submission is deferred to when it's actually submitted
 * for review, so this section (and licenseConsented below) stays visible
 * and editable for as long as the item is still a draft — see
 * `isFirstSubmission` below.
 *
 * Save as Draft initiative: the live RHF resolver is always the lenient
 * `draftKnowledgeItemSchema` (only title+contentType required) so neither
 * button is ever blocked by an incomplete form; "Submit for Review"/"Save
 * Changes" instead runs the real strict schema (createKnowledgeItemSchema/
 * updateKnowledgeItemSchema) by hand inside onSubmit, mapping any failures
 * onto the form via setError. "Save Draft" skips that manual check
 * entirely and posts with `action: "draft"`.
 */
export function SubmitResourceForm({
  categories,
  communities,
  tags,
  existingItem,
  currentUserId,
  initialContentType,
}: {
  categories: KnowledgeCategoryOption[];
  communities: { id: string; name: string }[];
  tags: KnowledgeTagOption[];
  existingItem?: KnowledgeItemForEdit;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
  /** Preselects the content-type dropdown in create mode (e.g. `?type=` on /library/new) — ignored when editing, since existingItem.contentType already wins. */
  initialContentType?: KnowledgeContentType;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<"file" | "link">(existingItem?.externalUrl ? "link" : "file");
  const [heroImage, setHeroImage] = useState<File | null>(null);
  // Which button was actually clicked — read synchronously inside onSubmit
  // (a ref, not state, since RHF's handleSubmit fires in the same
  // click→submit cycle a state update wouldn't be visible in yet).
  const pendingActionRef = useRef<"draft" | "submit">("submit");
  // "Save Draft" on an existing draft stays on this same page (no
  // navigation, so the SavedBanner-on-redirect convention every other save
  // in this app uses doesn't fire) — this is the only in-component
  // confirmation for that one case. Cleared on the next submit attempt.
  const [draftSaved, setDraftSaved] = useState(false);

  // A draft's visibility/invitedUserIds/licenseConsented are genuinely
  // still being decided — this is its real first submission, deferred from
  // creation — so those fields behave exactly like brand-new-item mode
  // (rendered + required) for as long as the item stays a draft.
  const isFirstSubmission = !existingItem || existingItem.status === KnowledgeStatus.draft;

  const form = useForm<CreateKnowledgeItemValues>({
    resolver: zodResolver(draftKnowledgeItemSchema),
    defaultValues: existingItem
      ? {
          title: existingItem.title,
          body: existingItem.body,
          contentType: existingItem.contentType,
          level: existingItem.level,
          // Genuinely editable, like categoryIds below (unlike visibility/
          // invitedUserIds, which stay create-only once past isFirstSubmission).
          communityIds: existingItem.communityIds,
          categoryIds: existingItem.categoryIds,
          tagIds: existingItem.tagIds,
          youtubeUrl: existingItem.youtubeUrl,
          externalUrl: existingItem.externalUrl,
          deidentificationConfirmed: existingItem.deidentificationConfirmed,
          showTitleOverlay: existingItem.showTitleOverlay,
          licenseConsented: isFirstSubmission ? false : true,
          // Visibility isn't editable past a draft's first submission —
          // hidden from the UI and hardcoded here, same "harmless
          // placeholder" pattern as SubmitEventForm's edit-mode
          // invitedUserIds. While still a draft, KnowledgeItemForEdit
          // doesn't carry the real value either (never set yet), so this
          // starts at the same default a new item would.
          visibility: KnowledgeVisibility.public,
          invitedUserIds: [],
        }
      : initialContentType
        ? { ...DEFAULT_VALUES, contentType: initialContentType }
        : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const contentType = form.watch("contentType");
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = contentType === KnowledgeContentType.case_study;
  const isBlogPost = contentType === KnowledgeContentType.blog_post;
  const visibility = form.watch("visibility");
  const isRestricted = visibility === KnowledgeVisibility.restricted;
  const selectedCommunityIds = form.watch("communityIds");
  const hasHeroImage = Boolean(heroImage || existingItem?.heroImageUrl);

  async function onSubmit(values: CreateKnowledgeItemValues) {
    const action = pendingActionRef.current;

    // The live RHF resolver (draftKnowledgeItemSchema) is deliberately
    // lenient so neither button is ever blocked mid-edit — "Submit for
    // Review"/"Save Changes" instead runs the real strict schema here, by
    // hand, only when that's the button that was actually clicked.
    if (action === "submit") {
      const strictSchema = isFirstSubmission ? createKnowledgeItemSchema : updateKnowledgeItemSchema;
      const result = strictSchema.safeParse(values);
      if (!result.success) {
        for (const issue of result.error.issues) {
          form.setError(issue.path.join(".") as keyof CreateKnowledgeItemValues, { message: issue.message });
        }
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setDraftSaved(false);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("action", action);
      formData.append("title", values.title);
      if (values.body) formData.append("body", values.body);
      formData.append("contentType", values.contentType);
      if (values.level) formData.append("level", values.level);
      // Genuinely editable — sent unconditionally, unlike visibility/
      // invitedUserIds below which stop being sent once isFirstSubmission
      // goes false.
      values.communityIds.forEach((communityId) => formData.append("communityIds", communityId));
      values.categoryIds.forEach((categoryId) => formData.append("categoryIds", categoryId));
      values.tagIds.forEach((tagId) => formData.append("tagIds", tagId));
      if (isRecordedLecture && values.youtubeUrl) formData.append("youtubeUrl", values.youtubeUrl);
      const requiresAttachmentOrLink = !isRecordedLecture && !isBlogPost;
      if (requiresAttachmentOrLink && sourceMode === "link" && values.externalUrl) {
        formData.append("externalUrl", values.externalUrl);
      }
      formData.append("deidentificationConfirmed", String(isCaseStudy && values.deidentificationConfirmed));
      formData.append("showTitleOverlay", String(values.showTitleOverlay));
      if (isFirstSubmission) {
        formData.append("licenseConsented", String(values.licenseConsented));
        formData.append("visibility", values.visibility);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
      }
      if (requiresAttachmentOrLink && sourceMode === "file" && file) formData.append("file", file);
      if (heroImage) formData.append("heroImage", heroImage);

      const res = await fetch(existingItem ? `/api/library/${existingItem.id}` : "/api/library", {
        method: existingItem ? "PATCH" : "POST",
        headers: { "x-csrf-token": csrfToken },
        body: formData,
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

      if (action === "draft") {
        if (existingItem) {
          // Same page, no navigation — the SavedBanner-on-redirect
          // convention every other save here uses never fires, so this is
          // the only confirmation the save actually happened.
          setDraftSaved(true);
        } else {
          // Brand-new draft — the id only exists now, so this is the first
          // point a resumable edit URL is reachable from. Real navigation to
          // a fresh page, so the usual ?saved=1 + SavedBanner convention
          // applies there instead.
          const created = (await res.json().catch(() => null)) as { id: string } | null;
          if (created?.id) router.replace(`/library/${created.id}/edit?saved=1`);
        }
        router.refresh();
        return;
      }

      if (existingItem) {
        // A draft's real first submission, or a rejected item's
        // resubmission, flips status to pending_review server-side (see
        // updateKnowledgeItem's nextStatus logic) — the public detail page
        // only ever shows published/flagged items and 404s on anything
        // else, even for the item's own contributor. Send those back to
        // the edit page instead; only an already-published item (a plain
        // "Save Changes" edit that doesn't change status) is safe to send
        // to its own detail page.
        const willBePendingReview =
          existingItem.status === KnowledgeStatus.draft || existingItem.status === KnowledgeStatus.rejected;
        // Replace (not push) so this edit page's history entry doesn't
        // linger for BackLink's router.back() on the details page to land
        // on — same rationale as WritePostForm/EditThreadForm.
        router.replace(
          willBePendingReview ? `/library/${existingItem.id}/edit?saved=1` : `/library/${existingItem.id}?saved=1`,
        );
      } else {
        router.push("/library/mine");
      }
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
        {isFirstSubmission && (
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
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="contentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Content type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(KnowledgeContentType).map((value) => (
                      <SelectItem key={value} value={value}>
                        {CONTENT_TYPE_LABELS[value]}
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
            name="level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Career-stage level</FormLabel>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(KnowledgeLevel).map((value) => (
                      <SelectItem key={value} value={value}>
                        {LEVEL_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Managing Diabetic Ketoacidosis in the ED" {...field} />
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
              <FormLabel>Content</FormLabel>
              <FormControl>
                <TiptapEditor
                  content={field.value ?? ""}
                  onChange={field.onChange}
                  onImageUploadStateChange={setImageUploading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="communityIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Communities</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-4 rounded-md border p-3">
                  {communities.map((community) => (
                    <label key={community.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
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
              <FormDescription>Select at least one community this resource belongs to.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedCommunityIds.length > 0 && (
          <FormField
            control={form.control}
            name="categoryIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categories (optional)</FormLabel>
                <CategoryCheckboxField
                  categories={categories.filter((category) => selectedCommunityIds.includes(category.communityId))}
                  communities={communities.filter((community) => selectedCommunityIds.includes(community.id))}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {tags.length > 0 && (
          <FormField
            control={form.control}
            name="tagIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags (optional)</FormLabel>
                <div className="flex flex-wrap gap-4">
                  {tags.map((tag) => {
                    const checked = field.value.includes(tag.id);
                    return (
                      <label key={tag.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            field.onChange(
                              c === true ? [...field.value, tag.id] : field.value.filter((id) => id !== tag.id),
                            )
                          }
                        />
                        {tag.name}
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!isBlogPost && (isRecordedLecture ? (
          <FormField
            control={form.control}
            name="youtubeUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>YouTube URL</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://youtube.com/watch?v=…"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="resource-source-mode" className="text-sm font-medium">
                How do you want to provide your document?
              </label>
              <Select
                value={sourceMode}
                onValueChange={(value) => {
                  const mode = value as "file" | "link";
                  setSourceMode(mode);
                  if (mode === "file") {
                    form.setValue("externalUrl", null);
                  } else {
                    setFile(null);
                  }
                }}
              >
                <SelectTrigger id="resource-source-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">Upload a file</SelectItem>
                  <SelectItem value="link">Web link to external source</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sourceMode === "file" ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="resource-file" className="text-sm font-medium">
                  File
                </label>
                {existingItem?.attachment && !file && (
                  <a
                    href={existingItem.attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {existingItem.attachment.fileName}
                  </a>
                )}
                <input
                  id="resource-file"
                  type="file"
                  accept={DOCUMENT_ACCEPT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  {file?.type.startsWith("video/")
                    ? "Video (MP4/WebM/MOV) — up to 500MB."
                    : "PDF, Word, PowerPoint, plain text, or image (JPEG/PNG/WebP/GIF/BMP) up to 20MB, or video (MP4/WebM/MOV) up to 500MB."}
                </p>
                {existingItem?.attachment && (
                  <p className="text-xs text-muted-foreground">Choose a new file to replace the current one.</p>
                )}
              </div>
            ) : (
              <FormField
                control={form.control}
                name="externalUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://docs.google.com/document/d/…"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <label htmlFor="hero-image" className="text-sm font-medium">
            Hero image (optional)
          </label>
          {existingItem?.heroImageUrl && !heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={existingItem.heroImageUrl}
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
          {existingItem?.heroImageUrl && (
            <p className="text-xs text-muted-foreground">Choose a new file to replace the current image.</p>
          )}
          {isRecordedLecture && (
            <p className="text-xs text-muted-foreground">
              Leave blank to use the video&apos;s YouTube thumbnail (default).
            </p>
          )}
        </div>

        <FormField
          control={form.control}
          name="showTitleOverlay"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  disabled={!hasHeroImage}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel className="!mt-0">Show title on banner</FormLabel>
                <FormDescription>
                  {hasHeroImage
                    ? "Overlay the title in white text on a dark gradient at the bottom of the hero image, instead of showing it separately below."
                    : "Add a hero image above to enable this."}
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isCaseStudy && (
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

        {error && <p className="text-sm text-destructive">{error}</p>}
        {draftSaved && <p className="text-sm text-success">Draft saved.</p>}

        <div className="flex items-center gap-3">
          {isFirstSubmission && (
            <Button
              type="submit"
              variant="outline"
              disabled={submitting || imageUploading}
              onClick={() => {
                pendingActionRef.current = "draft";
              }}
            >
              {submitting && pendingActionRef.current === "draft" ? "Saving…" : "Save Draft"}
            </Button>
          )}
          <Button
            type="submit"
            disabled={submitting || imageUploading}
            onClick={() => {
              pendingActionRef.current = "submit";
            }}
          >
            {submitting && pendingActionRef.current === "submit"
              ? "Saving…"
              : isFirstSubmission
                ? "Submit for Review"
                : "Save Changes"}
          </Button>
          {existingItem?.status === KnowledgeStatus.draft && (
            <DeleteLibraryItemButton
              itemId={existingItem.id}
              title={existingItem.title}
              hasEarnedHours={false}
              redirectTo="/library/mine"
            />
          )}
        </div>
      </form>
    </Form>
  );
}
