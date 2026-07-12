"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Avatar } from "@/components/ui/avatar";
import { TeamRoleBadge } from "@/lib/generated/prisma/enums";
import { TEAM_ROLE_LABELS } from "@/lib/team";
import { teamMemberSchema, type TeamMemberFormValues } from "@/lib/validation/team-member";
import { getCsrfToken } from "@/lib/csrf-client";

export function TeamMemberForm({
  member,
}: {
  member?: {
    id: string;
    name: string;
    roleBadge: TeamRoleBadge;
    title: string;
    bio: string;
    active: boolean;
    photoUrl: string | null;
  };
}) {
  const router = useRouter();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<TeamMemberFormValues>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
      name: member?.name ?? "",
      roleBadge: member?.roleBadge ?? ("" as TeamRoleBadge),
      title: member?.title ?? "",
      bio: member?.bio ?? "",
      active: member?.active ?? true,
    },
    mode: "onTouched",
  });

  async function onSubmit(values: TeamMemberFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("name", values.name);
      body.set("roleBadge", values.roleBadge);
      body.set("title", values.title);
      body.set("bio", values.bio);
      body.set("active", String(values.active));
      if (photoFile) body.set("photo", photoFile);
      if (member && removePhoto) body.set("removePhoto", "true");

      const csrfToken = await getCsrfToken();
      const res = await fetch(member ? `/api/admin/team/${member.id}` : "/api/admin/team", {
        method: member ? "PATCH" : "POST",
        headers: { "x-csrf-token": csrfToken },
        body,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : payload?.error
              ? JSON.stringify(payload.error)
              : "Request failed",
        );
      }
      router.push("/admin/team");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const previewUrl = photoFile ? URL.createObjectURL(photoFile) : member?.photoUrl ?? null;
  const showPreview = previewUrl && !(member && removePhoto && !photoFile);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-w-xl flex-col gap-5"
        noValidate
      >
        <div className="flex items-center gap-4">
          <Avatar name={form.watch("name") || "?"} src={showPreview ? previewUrl : null} size="xl" />
          <div className="flex flex-col gap-2">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setPhotoFile(e.target.files?.[0] ?? null);
                setRemovePhoto(false);
              }}
            />
            {member?.photoUrl && !photoFile && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={removePhoto}
                  onCheckedChange={(checked) => setRemovePhoto(checked === true)}
                />
                Remove current photo
              </label>
            )}
          </div>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="roleBadge"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(TeamRoleBadge).map((value) => (
                    <SelectItem key={value} value={value}>
                      {TEAM_ROLE_LABELS[value]}
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title / affiliation</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Physician" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea rows={5} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              </FormControl>
              <FormLabel className="!mt-0">Visible on the public Our Team page</FormLabel>
            </FormItem>
          )}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : member ? "Save changes" : "Add team member"}
          </Button>
          <Button type="button" variant="outline" disabled={submitting} asChild>
            <Link href="/admin/team">Cancel</Link>
          </Button>
        </div>
      </form>
    </Form>
  );
}
