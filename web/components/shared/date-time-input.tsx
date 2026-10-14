"use client";

import { forwardRef, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STEPPED_TIMES, formatTimeLabel, joinDateTimeLocal, splitDateTimeLocal } from "@/lib/datetime-input";

type DateTimeInputProps = {
  /** "YYYY-MM-DDTHH:mm", or "" when empty — the same shape a datetime-local input uses. */
  value: string;
  /** Called with "YYYY-MM-DDTHH:mm" once both a date and a time are chosen, "" otherwise. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Date field plus a time dropdown on the 15-minute grid, standing in for
 * <input type="datetime-local">, whose own picker offers every minute in
 * most browsers whatever `step` says. A stored time that is off the grid
 * (e.g. 14:47 from before this control existed) is listed too, so editing
 * never changes it behind the member's back.
 */
export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(function DateTimeInput(
  { value, onChange, onBlur, name, disabled, id, ...aria },
  ref,
) {
  // Held locally so a date picked before a time (or vice versa) isn't lost
  // while `value` is still "".
  const [parts, setParts] = useState(() => splitDateTimeLocal(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Changed from outside, e.g. "Ends" following "Starts".
    setLastValue(value);
    if (value !== joinDateTimeLocal(parts)) setParts(splitDateTimeLocal(value));
  }

  function update(next: { date: string; time: string }) {
    setParts(next);
    const joined = joinDateTimeLocal(next);
    setLastValue(joined);
    onChange(joined);
  }

  // With no time chosen yet, open the list at the start of the working day
  // rather than at midnight.
  const morningRef = useRef<HTMLDivElement>(null);

  const times =
    parts.time && !STEPPED_TIMES.includes(parts.time) ? [...STEPPED_TIMES, parts.time].sort() : STEPPED_TIMES;

  return (
    <div className="flex w-full gap-2">
      <Input
        ref={ref}
        id={id}
        name={name}
        type="date"
        className="min-w-0 flex-1"
        value={parts.date}
        disabled={disabled}
        onChange={(event) => update({ ...parts, date: event.target.value })}
        onBlur={onBlur}
        {...aria}
      />
      <Select
        value={parts.time}
        disabled={disabled}
        onValueChange={(time) => update({ ...parts, time })}
        onOpenChange={(open) => {
          if (!open) onBlur?.();
          else if (!parts.time) requestAnimationFrame(() => morningRef.current?.scrollIntoView({ block: "start" }));
        }}
      >
        <SelectTrigger className="w-32 shrink-0" aria-label="Time" aria-invalid={aria["aria-invalid"]}>
          <SelectValue placeholder="Time" />
        </SelectTrigger>
        <SelectContent>
          {times.map((time) => (
            <SelectItem key={time} value={time} ref={time === "09:00" ? morningRef : undefined}>
              {formatTimeLabel(time)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});
