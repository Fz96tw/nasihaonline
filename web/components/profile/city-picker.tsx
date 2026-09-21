"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CitySuggestion } from "@/lib/cities";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 200;

export type SelectedCity = { id: number; label: string; iso2: string };

async function fetchCities(query: string, country: string): Promise<CitySuggestion[]> {
  const params = new URLSearchParams({ q: query, country });
  const response = await fetch(`/api/cities?${params}`);
  if (!response.ok) throw new Error("Failed to search cities");
  return ((await response.json()) as { cities: CitySuggestion[] }).cities;
}

/**
 * Autocomplete over the server's bundled GeoNames list — a member can only
 * choose a real city (no free text), so the Directory map always has
 * coordinates for it. `country` is the form's Country / Region text; the API
 * narrows suggestions to it when it's recognized.
 */
export function CityPicker({
  value,
  country,
  onChange,
}: {
  value: SelectedCity | null;
  country: string;
  onChange: (city: SelectedCity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data: cities = [], isFetching } = useQuery({
    queryKey: ["cities", query, country.trim()],
    queryFn: () => fetchCities(query, country.trim()),
    enabled: open && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const searching = search.trim().length >= 2;
  const emptyText = !searching
    ? "Type at least 2 letters to search."
    : isFetching || search.trim() !== query
      ? "Searching…"
      : "No matching city. Check the spelling or the country above.";

  function choose(city: SelectedCity | null) {
    onChange(city);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="flex gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-w-0 flex-1 justify-between font-normal"
          >
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value?.label ?? "Search for your city…"}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* The server does the matching (the city table never ships to the
              browser), so cmdk's own client-side filter is switched off. */}
          <Command shouldFilter={false}>
            <CommandInput placeholder="Type a city name…" value={search} onValueChange={setSearch} />
            <CommandList>
              {cities.length === 0 || !searching ? (
                <CommandEmpty>{emptyText}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {cities.map((city) => (
                    <CommandItem
                      key={city.id}
                      value={String(city.id)}
                      onSelect={() =>
                        choose({ id: city.id, label: `${city.name}, ${city.countryName}`, iso2: city.iso2 })
                      }
                    >
                      <Check className={cn("h-4 w-4", value?.id === city.id ? "opacity-100" : "opacity-0")} />
                      {city.name}
                      <span className="text-muted-foreground">{city.countryName}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="outline" size="icon" onClick={() => choose(null)} aria-label="Clear city">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
