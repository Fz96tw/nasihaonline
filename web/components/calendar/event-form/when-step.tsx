"use client";

import type { MutableRefObject } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecurrenceFrequency } from "@/lib/generated/prisma/enums";
import type { CreateEventValues } from "@/lib/validation/event";
import { DATETIME_LOCAL_STEP_SECONDS, snapDatetimeLocalValue } from "@/lib/datetime-input";
import { describeRecurrence } from "@/lib/recurrence";
import { IANA_TIMEZONES, WEEKDAY_LABELS, addOneHour, defaultUntilIso, toggleWeekday } from "./shared";

/** "When" section of the event form: start/end, timezone, recurrence. */
export function WhenStep({
  form,
  editingTimezone,
  setEditingTimezone,
  endsAutoFilledRef,
}: {
  form: UseFormReturn<CreateEventValues>;
  editingTimezone: boolean;
  setEditingTimezone: (editing: boolean) => void;
  /** True while "Ends" holds a value auto-filled from "Starts" rather than one the host typed. */
  endsAutoFilledRef: MutableRefObject<boolean>;
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">When</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="startsAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Starts</FormLabel>
              <FormControl>
                <Input
                  type="datetime-local"
                  step={DATETIME_LOCAL_STEP_SECONDS}
                  {...field}
                  onBlur={(event) => {
                    const snapped = snapDatetimeLocalValue(event.target.value);
                    field.onChange(snapped);
                    const currentEnd = form.getValues("endsAt");
                    if (snapped && (!currentEnd || endsAutoFilledRef.current)) {
                      const end = addOneHour(snapped);
                      if (end) {
                        form.setValue("endsAt", end, { shouldDirty: true });
                        endsAutoFilledRef.current = true;
                      }
                    }
                    field.onBlur();
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="endsAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ends (optional)</FormLabel>
              <FormControl>
                <Input
                  type="datetime-local"
                  step={DATETIME_LOCAL_STEP_SECONDS}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    endsAutoFilledRef.current = false;
                    field.onChange(e.target.value.length > 0 ? e.target.value : null);
                  }}
                  onBlur={(e) => {
                    if (e.target.value) field.onChange(snapDatetimeLocalValue(e.target.value));
                    field.onBlur();
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="timezone"
        render={({ field }) => (
          <FormItem>
            {editingTimezone || form.formState.errors.timezone ? (
              <>
                <FormLabel>Timezone</FormLabel>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a timezone" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {IANA_TIMEZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  What &quot;Starts&quot;/&quot;Ends&quot; above are in — defaults to your own, but pick a different
                  one if you&apos;re scheduling for another timezone.
                </FormDescription>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Times are in {field.value ?? "your timezone"}.{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setEditingTimezone(true)}
                >
                  Change
                </button>
              </p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="recurrence"
        render={({ field }) => {
          const recurrence = field.value;
          const repeats = recurrence !== null;
          return (
            <FormItem className="rounded-md border p-4">
              <div className="flex flex-row items-center justify-between gap-4">
                <div>
                  <FormLabel>Repeat</FormLabel>
                  <FormDescription>
                    Changing the repeat schedule on an existing series updates all upcoming occurrences —
                    there&apos;s no way to edit or skip a single date.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={repeats}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        field.onChange(null);
                        return;
                      }
                      // Default to the start date's own weekday so a host
                      // who never touches the day picker doesn't hit the
                      // "select at least one day" validation trap silently.
                      const startsAt = new Date(form.getValues("startsAt"));
                      const defaultWeekday = Number.isNaN(startsAt.getTime()) ? [] : [startsAt.getDay()];
                      field.onChange({
                        frequency: RecurrenceFrequency.weekly,
                        interval: 1,
                        byWeekday: defaultWeekday,
                        until: null,
                      });
                    }}
                  />
                </FormControl>
              </div>
              {repeats && recurrence && (
                <div className="mt-3 flex flex-col gap-3">
                  <Select
                    value={recurrence.frequency}
                    onValueChange={(value) =>
                      field.onChange({
                        ...recurrence,
                        frequency: value as RecurrenceFrequency,
                        byWeekday: value === RecurrenceFrequency.weekly ? recurrence.byWeekday : [],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={RecurrenceFrequency.daily}>Daily</SelectItem>
                      <SelectItem value={RecurrenceFrequency.weekly}>Weekly</SelectItem>
                      <SelectItem value={RecurrenceFrequency.monthly}>Monthly</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2 text-sm">
                    <span>Every</span>
                    <Input
                      type="number"
                      min={1}
                      max={52}
                      className="w-16"
                      value={recurrence.interval}
                      onChange={(e) =>
                        field.onChange({
                          ...recurrence,
                          interval: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    <span>
                      {recurrence.frequency === RecurrenceFrequency.daily
                        ? "day(s)"
                        : recurrence.frequency === RecurrenceFrequency.weekly
                          ? "week(s)"
                          : "month(s)"}
                    </span>
                  </div>

                  {recurrence.frequency === RecurrenceFrequency.weekly && (
                    <div className="flex flex-col gap-1">
                      <div className="grid grid-cols-7 gap-1 sm:flex">
                        {WEEKDAY_LABELS.map((label, day) => (
                          <Button
                            key={label}
                            type="button"
                            size="sm"
                            className="px-0 sm:px-3"
                            variant={recurrence.byWeekday.includes(day) ? "default" : "outline"}
                            onClick={() =>
                              field.onChange({
                                ...recurrence,
                                byWeekday: toggleWeekday(recurrence.byWeekday, day),
                              })
                            }
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      {/* FormMessage below only reads the top-level "recurrence"
                        field's error, which has no .message of its own when
                        the actual Zod issue is nested at recurrence.byWeekday —
                        read that path directly so this doesn't fail silently. */}
                      {form.formState.errors.recurrence?.byWeekday?.message ? (
                        <p className="text-xs font-medium text-destructive">
                          {String(form.formState.errors.recurrence.byWeekday.message)}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Checkbox
                      checked={recurrence.until !== null}
                      onCheckedChange={(checked) =>
                        field.onChange({
                          ...recurrence,
                          until: checked === true ? defaultUntilIso(form.getValues("startsAt")) : null,
                        })
                      }
                    />
                    <span>Repeat until</span>
                    {recurrence.until && (
                      <Input
                        type="date"
                        className="w-auto"
                        value={recurrence.until.slice(0, 10)}
                        onChange={(e) =>
                          field.onChange({
                            ...recurrence,
                            until: `${e.target.value}T23:59:59.000Z`,
                          })
                        }
                      />
                    )}
                  </div>
                  {form.formState.errors.recurrence?.until?.message ? (
                    <p className="text-xs font-medium text-destructive">
                      {String(form.formState.errors.recurrence.until.message)}
                    </p>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    {describeRecurrence({
                      ...recurrence,
                      until: recurrence.until ? new Date(recurrence.until) : null,
                    })}
                  </p>
                </div>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </section>
  );
}
