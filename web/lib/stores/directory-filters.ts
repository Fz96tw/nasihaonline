import { create } from "zustand";
import type { InterestArea, Tier } from "@/lib/generated/prisma/enums";

export type DirectoryTierFilter = Tier | "all";

type DirectoryFilterState = {
  search: string;
  tier: DirectoryTierFilter;
  // Selected Skill ids (§4.3/§4.5/§7.3) — a member matches if they have ANY
  // of the selected skills (empty = no filtering).
  skillIds: string[];
  // Selected Interest Areas — same ANY-match semantics as skillIds.
  interestAreas: InterestArea[];
  // ISO 3166-1 alpha-2 code of the country picked on the directory map, or
  // null for "all countries". Member countryRegion is free text, so callers
  // compare via resolveCountry() (lib/country-centroids.ts), not raw strings.
  selectedCountry: string | null;
  setSearch: (search: string) => void;
  setTier: (tier: DirectoryTierFilter) => void;
  toggleSkill: (skillId: string) => void;
  toggleInterestArea: (area: InterestArea) => void;
  setSelectedCountry: (iso2: string | null) => void;
};

export const useDirectoryFilters = create<DirectoryFilterState>((set) => ({
  search: "",
  tier: "all",
  skillIds: [],
  interestAreas: [],
  selectedCountry: null,
  setSearch: (search) => set({ search }),
  setTier: (tier) => set({ tier }),
  toggleSkill: (skillId) =>
    set((state) => ({
      skillIds: state.skillIds.includes(skillId)
        ? state.skillIds.filter((id) => id !== skillId)
        : [...state.skillIds, skillId],
    })),
  toggleInterestArea: (area) =>
    set((state) => ({
      interestAreas: state.interestAreas.includes(area)
        ? state.interestAreas.filter((value) => value !== area)
        : [...state.interestAreas, area],
    })),
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
}));
