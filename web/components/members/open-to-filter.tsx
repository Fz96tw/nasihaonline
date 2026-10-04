"use client";

import { Check, ChevronsUpDown } from "lucide-react";
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
import { OPEN_TO_LABELS, OPEN_TO_OPTIONS } from "@/lib/open-to";
import { cn } from "@/lib/utils";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";

/** Directory "Open to" filter — same ANY-match popover pattern as InterestAreaFilter, over the fixed OpenToTag enum. */
export function OpenToFilter() {
  const openTo = useDirectoryFilters((state) => state.openTo);
  const toggleOpenTo = useDirectoryFilters((state) => state.toggleOpenTo);

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="justify-between font-normal sm:w-56">
            <span className="truncate">
              {openTo.length === 0
                ? "Filter by open to"
                : `${openTo.length} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>No option found.</CommandEmpty>
              <CommandGroup>
                {OPEN_TO_OPTIONS.map((option) => (
                  <CommandItem
                    key={option}
                    value={OPEN_TO_LABELS[option]}
                    onSelect={() => toggleOpenTo(option)}
                  >
                    <Check
                      className={cn("h-4 w-4", openTo.includes(option) ? "opacity-100" : "opacity-0")}
                    />
                    {OPEN_TO_LABELS[option]}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {openTo.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {openTo.map((option) => (
            <Badge key={option} variant="info" className="gap-1 pr-1">
              {OPEN_TO_LABELS[option]}
              <button
                type="button"
                onClick={() => toggleOpenTo(option)}
                aria-label={`Remove ${OPEN_TO_LABELS[option]} filter`}
                className="rounded-full p-0.5 hover:bg-black/10"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
