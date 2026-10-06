"use client";

import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS, type KnowledgeCategoryOption, type KnowledgeTagOption } from "@/lib/library";
import type { CreateKnowledgeItemValues } from "@/lib/validation/knowledge";

/** "Basics" section of the resource form: content type, level, title, communities, categories, tags. */
export function BasicsStep({
  form,
  communities,
  categories,
  tags,
}: {
  form: UseFormReturn<CreateKnowledgeItemValues>;
  communities: { id: string; name: string }[];
  categories: KnowledgeCategoryOption[];
  tags: KnowledgeTagOption[];
}) {
  const selectedCommunityIds = form.watch("communityIds");

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">Basics</h2>
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
    </section>
  );
}
