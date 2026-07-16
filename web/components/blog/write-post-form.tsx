"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TiptapEditor } from "@/components/blog/tiptap-editor";
import { createPostSchema, type CreatePostValues } from "@/lib/validation/post";
import { getCsrfToken } from "@/lib/csrf-client";
import type { PostCategoryOption, PostTagOption } from "@/lib/blog";

const DEFAULT_VALUES: CreatePostValues = {
  title: "",
  body: "",
  categoryId: "",
  tagIds: [],
  licenseConsented: false,
};

type ExistingPost = {
  slug: string;
  title: string;
  body: string;
  categoryId: string;
  tagIds: string[];
  heroImageUrl: string | null;
};

/**
 * "Write a Post" form (§4.8), posted from /blog/new, and reused from
 * /blog/[slug]/edit (§11.12) when `existingPost` is supplied. Submits as
 * multipart/form-data (not JSON like SubmitEventForm) because the optional
 * hero image travels alongside the text fields in one request — see
 * POST /api/blog / PATCH /api/blog/[slug]. The licensing checkbox is a
 * one-time consent from the original publish, so it's create-only —
 * omitted entirely (and from updatePostSchema) when editing.
 */
export function WritePostForm({
  categories,
  tags,
  existingPost,
}: {
  categories: PostCategoryOption[];
  tags: PostTagOption[];
  existingPost?: ExistingPost;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreatePostValues>({
    resolver: zodResolver(createPostSchema),
    defaultValues: existingPost
      ? {
          title: existingPost.title,
          body: existingPost.body,
          categoryId: existingPost.categoryId,
          tagIds: existingPost.tagIds,
          licenseConsented: true,
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  async function onSubmit(values: CreatePostValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("title", values.title);
      formData.append("body", values.body);
      formData.append("categoryId", values.categoryId);
      values.tagIds.forEach((tagId) => formData.append("tagIds", tagId));
      if (!existingPost) formData.append("licenseConsented", String(values.licenseConsented));
      if (heroImage) formData.append("heroImage", heroImage);

      const res = await fetch(existingPost ? `/api/blog/${existingPost.slug}` : "/api/blog", {
        method: existingPost ? "PATCH" : "POST",
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
      const { slug } = await res.json();
      router.push(`/blog/${slug}`);
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Heart Failure Guidelines: What Changed" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                              c === true
                                ? [...field.value, tag.id]
                                : field.value.filter((id) => id !== tag.id),
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

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Post</FormLabel>
              <FormControl>
                <TiptapEditor content={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="hero-image" className="text-sm font-medium">
            Hero image (optional)
          </label>
          {existingPost?.heroImageUrl && !heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={existingPost.heroImageUrl}
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
          {existingPost?.heroImageUrl && (
            <p className="text-xs text-muted-foreground">Choose a new file to replace the current image.</p>
          )}
        </div>

        {!existingPost && (
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
                    I retain ownership of what I write, and grant NASIHA a non-exclusive right to
                    display this post to the membership and public.
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
            {submitting ? "Saving…" : existingPost ? "Save Changes" : "Publish Post"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
