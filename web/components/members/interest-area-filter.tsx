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
import { InterestArea } from "@/lib/generated/prisma/enums";
import { INTEREST_AREA_LABELS } from "@/lib/interest-areas";
import { cn } from "@/lib/utils";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";

const OPTIONS = Object.values(InterestArea);

/**
 * Directory Interest Areas filter — same ANY-match popover pattern as
 * SkillFilter, but over the fixed InterestArea enum rather than the Skill
 * catalog, so no options need to be passed in from the server.
 */
export function InterestAreaFilter() {
  const interestAreas = useDirectoryFilters((state) => state.interestAreas);
  const toggleInterestArea = useDirectoryFilters((state) => state.toggleInterestArea);

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="justify-between font-normal sm:w-56">
            <span className="truncate">
              {interestAreas.length === 0
                ? "Filter by interest area"
                : `${interestAreas.length} interest area(s)`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search interest areas…" />
            <CommandList>
              <CommandEmpty>No interest area found.</CommandEmpty>
              <CommandGroup>
                {OPTIONS.map((option) => (
                  <CommandItem
                    key={option}
                    value={INTEREST_AREA_LABELS[option]}
                    onSelect={() => toggleInterestArea(option)}
                  >
                    <Check
                      className={cn("h-4 w-4", interestAreas.includes(option) ? "opacity-100" : "opacity-0")}
                    />
                    {INTEREST_AREA_LABELS[option]}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {interestAreas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {interestAreas.map((option) => (
            <Badge key={option} variant="info" className="gap-1 pr-1">
              {INTEREST_AREA_LABELS[option]}
              <button
                type="button"
                onClick={() => toggleInterestArea(option)}
                aria-label={`Remove ${INTEREST_AREA_LABELS[option]} filter`}
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
