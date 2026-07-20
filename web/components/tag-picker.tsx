"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TagOption = { id: string; name: string };

/**
 * Generic combobox + badge multi-select: search/select from a fixed
 * `options` list (no inline creation), selections shown as removable
 * badges above the trigger. Used for the Skill catalog (PRD §4.3/§7.3) and
 * for the fixed InterestArea list — both are curated lists too long for a
 * plain checkbox group.
 */
export function TagPicker({
  options,
  value,
  onChange,
  triggerLabel = "Add an item…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
}: {
  options: TagOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  triggerLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => value.includes(option.id));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <Badge key={option.id} variant="info" className="gap-1 pr-1">
              {option.name}
              <button
                type="button"
                onClick={() => toggle(option.id)}
                aria-label={`Remove ${option.name}`}
                className="rounded-full p-0.5 hover:bg-black/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {triggerLabel}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} value={option.name} onSelect={() => toggle(option.id)}>
                    <Check
                      className={cn("h-4 w-4", value.includes(option.id) ? "opacity-100" : "opacity-0")}
                    />
                    {option.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
