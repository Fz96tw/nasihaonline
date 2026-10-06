"use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS, type ReviewCategoryOption, type ReviewTagOption } from "@/lib/review";
import type { CreateReviewItemValues } from "@/lib/validation/review";

/** "Basics" section of the peer-review item form: title, description, content type, level, categories, tags. */
export function BasicsStep({
  form,
  categories,
  communities,
  tags,
}: {
  form: UseFormReturn<CreateReviewItemValues>;
  categories: ReviewCategoryOption[];
  communities: { id: string; name: string }[];
  tags: ReviewTagOption[];
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">Basics</h2>
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
                  {/* blog_post is Library-only (it has no attachment/externalUrl to
                      review, and its own review gate already runs through the
                      Steward queue) — excluded from Peer Review & Feedback's type list. */}
                  {Object.values(KnowledgeContentType)
                    .filter((value) => value !== KnowledgeContentType.blog_post)
                    .map((value) => (
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
            <CategoryCheckboxField
              categories={categories}
              communities={communities}
              value={field.value}
              onChange={field.onChange}
            />
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
                          field.onChange(c === true ? [...field.value, tag.id] : field.value.filter((id) => id !== tag.id))
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
    </section>
  );
}
