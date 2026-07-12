"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
import { type DirectoryMember } from "@/lib/members";
import { cn } from "@/lib/utils";

async function fetchMembers(): Promise<DirectoryMember[]> {
  const response = await fetch("/api/members");
  if (!response.ok) throw new Error("Failed to load members");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

/**
 * Single-select member picker for the "Log Contribution" form's optional
 * counterpart field (§4.4). Reuses the Directory listing endpoint rather
 * than a dedicated one — same member set the rest of the app already
 * treats as "pickable".
 */
export function CounterpartPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: members = [] } = useQuery({
    queryKey: ["members-for-counterpart"],
    queryFn: fetchMembers,
  });

  const selected = members.find((member) => member.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.name ?? "Unnamed member" : "None"}
          {selected ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear counterpart"
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
              className="rounded-full p-0.5 hover:bg-black/10"
            >
              <X className="h-4 w-4 opacity-50" />
            </span>
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search members…" />
          <CommandList>
            <CommandEmpty>No member found.</CommandEmpty>
            <CommandGroup>
              {members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={member.name ?? member.id}
                  onSelect={() => {
                    onChange(member.id === value ? null : member.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", member.id === value ? "opacity-100" : "opacity-0")} />
                  {member.name ?? "Unnamed member"}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
