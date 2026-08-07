"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { KnowledgeContentType, KnowledgeLevel, KnowledgeVisibility } from "@/lib/generated/prisma/enums";
import {
  CONTENT_TYPE_LABELS,
  LEVEL_LABELS,
  type KnowledgeCategoryOption,
  type KnowledgeItemForEdit,
  type KnowledgeTagOption,
} from "@/lib/library";
import { createKnowledgeItemSchema, type CreateKnowledgeItemValues } from "@/lib/validation/knowledge";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";

const DEFAULT_VALUES: CreateKnowledgeItemValues = {
  title: "",
  description: "",
  contentType: "" as KnowledgeContentType,
  level: "" as KnowledgeLevel,
  categoryIds: [],
  tagIds: [],
  youtubeUrl: null,
  externalUrl: null,
  deidentificationConfirmed: false,
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
 * createKnowledgeItemSchema/CreateKnowledgeItemValues in both modes (rather
 * than a separate edit-mode type) — same simplification as WritePostForm:
 * licenseConsented is a one-time consent from the original submission, so
 * it defaults to `true` and is hidden entirely when editing, and isn't sent
 * in the PATCH body (the server validates edits with updateKnowledgeItemSchema,
 * which omits it). contentType still drives the same conditional fields as
 * create: a YouTube URL input for recorded_lecture (no file/link), or for
 * every other type a `sourceMode` toggle between a file input and an
 * `externalUrl` input (mutually exclusive — toggling clears the other), with
 * an edit able to leave the existing attachment in place instead of
 * replacing it; case_study additionally requires the de-identification
 * checkbox, re-affirmed on every edit rather than carried forward silently.
 *
 * Restricted Knowledge Library Submissions, Objective 03: `visibility` is a
 * create-only 2-way choice (public / restricted), mirroring
 * SubmitEventForm's audience picker — edit mode hides the section entirely
 * and always submits it as public with no invitees (KnowledgeItemForEdit
 * doesn't carry the real visibility, since editing can't change it anyway;
 * see requireRestrictedKnowledgeItemInvariants in lib/validation/knowledge.ts).
 */
export function SubmitResourceForm({
  categories,
  tags,
  existingItem,
  currentUserId,
}: {
  categories: KnowledgeCategoryOption[];
  tags: KnowledgeTagOption[];
  existingItem?: KnowledgeItemForEdit;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<"file" | "link">(existingItem?.externalUrl ? "link" : "file");
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateKnowledgeItemValues>({
    resolver: zodResolver(createKnowledgeItemSchema),
    defaultValues: existingItem
      ? {
          title: existingItem.title,
          description: existingItem.description,
          contentType: existingItem.contentType,
          level: existingItem.level,
          categoryIds: existingItem.categoryIds,
          tagIds: existingItem.tagIds,
          youtubeUrl: existingItem.youtubeUrl,
          externalUrl: existingItem.externalUrl,
          deidentificationConfirmed: existingItem.deidentificationConfirmed,
          licenseConsented: true,
          // Visibility isn't editable from this form (create-only) — hidden
          // from the UI and hardcoded here, same "harmless placeholder"
          // pattern as SubmitEventForm's edit-mode invitedUserIds.
          visibility: KnowledgeVisibility.public,
          invitedUserIds: [],
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const contentType = form.watch("contentType");
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = contentType === KnowledgeContentType.case_study;
  const visibility = form.watch("visibility");
  const isRestricted = visibility === KnowledgeVisibility.restricted;

  async function onSubmit(values: CreateKnowledgeItemValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("title", values.title);
      formData.append("description", values.description);
      formData.append("contentType", values.contentType);
      formData.append("level", values.level);
      values.categoryIds.forEach((categoryId) => formData.append("categoryIds", categoryId));
      values.tagIds.forEach((tagId) => formData.append("tagIds", tagId));
      if (isRecordedLecture && values.youtubeUrl) formData.append("youtubeUrl", values.youtubeUrl);
      if (!isRecordedLecture && sourceMode === "link" && values.externalUrl) {
        formData.append("externalUrl", values.externalUrl);
      }
      formData.append("deidentificationConfirmed", String(isCaseStudy && values.deidentificationConfirmed));
      if (!existingItem) {
        formData.append("licenseConsented", String(values.licenseConsented));
        formData.append("visibility", values.visibility);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
      }
      if (!isRecordedLecture && sourceMode === "file" && file) formData.append("file", file);
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
      router.push("/library/mine");
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
        {!existingItem && (
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

        {!existingItem && isRestricted && (
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                <Select value={field.value} onValueChange={field.onChange}>
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
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categories</FormLabel>
              <div className="flex flex-wrap gap-4">
                {categories.map((category) => {
                  const checked = field.value.includes(category.id);
                  return (
                    <label key={category.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) =>
                          field.onChange(
                            c === true
                              ? [...field.value, category.id]
                              : field.value.filter((id) => id !== category.id),
                          )
                        }
                      />
                      {category.name}
                    </label>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

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

        {isRecordedLecture ? (
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
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={sourceMode === "file" ? "default" : "outline"}
                onClick={() => {
                  setSourceMode("file");
                  form.setValue("externalUrl", null);
                }}
              >
                Upload a file
              </Button>
              <Button
                type="button"
                size="sm"
                variant={sourceMode === "link" ? "default" : "outline"}
                onClick={() => {
                  setSourceMode("link");
                  setFile(null);
                }}
              >
                Link to an external resource
              </Button>
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
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
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
        )}

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

        {!existingItem && (
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

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : existingItem ? "Save Changes" : "Submit for Review"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
