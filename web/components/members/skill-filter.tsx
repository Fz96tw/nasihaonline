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
import { cn } from "@/lib/utils";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";

/**
 * Directory expertise-tag filter (§4.5/§7.3) — narrows the grid to members
 * with ANY of the selected skills. Popover trigger for picking tags, plus
 * removable badges below for whatever's currently selected.
 */
export function SkillFilter({ options }: { options: { id: string; name: string }[] }) {
  const skillIds = useDirectoryFilters((state) => state.skillIds);
  const toggleSkill = useDirectoryFilters((state) => state.toggleSkill);
  const selected = options.filter((option) => skillIds.includes(option.id));

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="justify-between font-normal sm:w-56">
            <span className="truncate">
              {skillIds.length === 0 ? "Filter by expertise" : `${skillIds.length} expertise tag(s)`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search expertise…" />
            <CommandList>
              <CommandEmpty>No skill found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} value={option.name} onSelect={() => toggleSkill(option.id)}>
                    <Check
                      className={cn("h-4 w-4", skillIds.includes(option.id) ? "opacity-100" : "opacity-0")}
                    />
                    {option.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <Badge key={option.id} variant="info" className="gap-1 pr-1">
              {option.name}
              <button
                type="button"
                onClick={() => toggleSkill(option.id)}
                aria-label={`Remove ${option.name} filter`}
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
