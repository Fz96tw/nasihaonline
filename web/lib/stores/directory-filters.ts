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
  // Key of the place picked on the directory map ("city:<geonameId>" or
  // "country:<ISO2>", see Place in lib/cities.ts), or null for everywhere.
  // Member countryRegion is free text, so callers derive a member's key via
  // memberPlace() rather than comparing raw strings.
  selectedPlace: string | null;
  setSearch: (search: string) => void;
  setTier: (tier: DirectoryTierFilter) => void;
  toggleSkill: (skillId: string) => void;
  toggleInterestArea: (area: InterestArea) => void;
  setSelectedPlace: (key: string | null) => void;
};

export const useDirectoryFilters = create<DirectoryFilterState>((set) => ({
  search: "",
  tier: "all",
  skillIds: [],
  interestAreas: [],
  selectedPlace: null,
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
  setSelectedPlace: (selectedPlace) => set({ selectedPlace }),
}));
