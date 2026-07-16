"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { adjustLedgerSchema, type AdjustLedgerValues } from "@/lib/validation/ledger-adjustment";
import { getCsrfToken } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

export interface AdjustableUser {
  id: string;
  name: string | null;
  email: string;
}

/**
 * Admin-only manual ledger correction (§4.4/§4.11 "ledger auditing") — the
 * only way a balance changes outside normal earn/spend. Unlike
 * LogContributionDialog's counterpart picker (which fetches the Directory
 * endpoint), the user list here is passed in from the server component:
 * an admin needs to target *any* user, including ones who've opted out of
 * Directory visibility.
 */
export function AdminLedgerAdjustmentDialog({ users }: { users: AdjustableUser[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<AdjustLedgerValues>({
    resolver: zodResolver(adjustLedgerSchema),
    defaultValues: { userId: "", hours: 0, reason: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: AdjustLedgerValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/admin/ledger/adjust", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.",
        );
      }
      form.reset({ userId: "", hours: 0, reason: "" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          form.reset({ userId: "", hours: 0, reason: "" });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Adjust Balance</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual ledger adjustment</DialogTitle>
          <DialogDescription>
            Posts an admin-confirmed correction directly to a member&apos;s balance. A reason is always
            required for the audit trail.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => {
                const selected = users.find((candidate) => candidate.id === field.value) ?? null;
                return (
                  <FormItem>
                    <FormLabel>Member</FormLabel>
                    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            aria-expanded={pickerOpen}
                            className="w-full justify-between font-normal"
                          >
                            {selected ? selected.name ?? selected.email : "Select a member"}
                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search members…" />
                          <CommandList>
                            <CommandEmpty>No member found.</CommandEmpty>
                            <CommandGroup>
                              {users.map((candidate) => (
                                <CommandItem
                                  key={candidate.id}
                                  value={`${candidate.name ?? ""} ${candidate.email}`}
                                  onSelect={() => {
                                    field.onChange(candidate.id);
                                    setPickerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      candidate.id === field.value ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  <span className="flex flex-col">
                                    <span>{candidate.name ?? "Unnamed member"}</span>
                                    <span className="text-xs text-muted-foreground">{candidate.email}</span>
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours (positive to credit, negative to debit)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.25"
                      inputMode="decimal"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea rows={3} value={field.value} onChange={(event) => field.onChange(event.target.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Posting…" : "Post adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
