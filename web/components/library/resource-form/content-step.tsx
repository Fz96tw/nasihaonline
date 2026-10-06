"use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";
import type { KnowledgeItemForEdit } from "@/lib/library";
import type { CreateKnowledgeItemValues } from "@/lib/validation/knowledge";
import { TiptapEditor } from "@/components/library/tiptap-editor";
import { DOCUMENT_ACCEPT } from "./shared";

/** "Content" section of the resource form: the rich-text body, the document/link/YouTube source, hero image and the case-study de-identification confirm. */
export function ContentStep({
  form,
  existingItem,
  setImageUploading,
  file,
  setFile,
  sourceMode,
  setSourceMode,
  heroImage,
  setHeroImage,
}: {
  form: UseFormReturn<CreateKnowledgeItemValues>;
  existingItem?: KnowledgeItemForEdit;
  setImageUploading: (uploading: boolean) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  sourceMode: "file" | "link";
  setSourceMode: (mode: "file" | "link") => void;
  heroImage: File | null;
  setHeroImage: (file: File | null) => void;
}) {
  const contentType = form.watch("contentType");
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = contentType === KnowledgeContentType.case_study;
  const isBlogPost = contentType === KnowledgeContentType.blog_post;
  const hasHeroImage = Boolean(heroImage || existingItem?.heroImageUrl);

  return (
    <section className="flex flex-col gap-5 border-t pt-6">
      <h2 className="text-base font-semibold">Content</h2>
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

      {!isRecordedLecture && (
        <FormField
          control={form.control}
          name="youtubeUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>YouTube video (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://youtube.com/watch?v=…"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                />
              </FormControl>
              <FormDescription>
                Embedded on the page{isBlogPost ? " above your post" : " alongside the document or link"}. Also used as the cover image if you don&apos;t add a hero image below.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
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
        {(isRecordedLecture || form.watch("youtubeUrl")) && (
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
                <FormLabel className="!mt-0">I confirm all patient information has been de-identified, including in any linked video</FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
      )}
    </section>
  );
}
