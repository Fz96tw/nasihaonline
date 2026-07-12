"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUser } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

const emptyValues: PasswordChangeValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function PasswordChangeForm() {
  const { user } = useUser();
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: emptyValues,
    mode: "onTouched",
  });

  async function onSubmit(values: PasswordChangeValues) {
    setSuccess(false);
    setSubmitError(null);

    if (!user) {
      setSubmitError("Your session has expired. Please sign in again.");
      return;
    }

    try {
      await user.updatePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      form.reset(emptyValues);
      setSuccess(true);
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        const clerkError = error.errors[0];
        const isCurrentPasswordError =
          clerkError?.meta?.paramName === "current_password" ||
          clerkError?.code === "form_password_incorrect";
        if (isCurrentPasswordError) {
          form.setError("currentPassword", {
            type: "server",
            message: clerkError.longMessage ?? clerkError.message ?? "Incorrect password.",
          });
        } else {
          setSubmitError(clerkError?.longMessage ?? clerkError?.message ?? "Something went wrong.");
        }
      } else {
        setSubmitError("Something went wrong changing your password. Please try again.");
      }
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}
        {success && (
          <p className="text-sm text-emerald-600" role="status">
            Password updated.
          </p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="self-start">
          {form.formState.isSubmitting ? "Saving..." : "Update password"}
        </Button>
      </form>
    </Form>
  );
}
