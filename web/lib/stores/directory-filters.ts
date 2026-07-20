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
  setSearch: (search: string) => void;
  setTier: (tier: DirectoryTierFilter) => void;
  toggleSkill: (skillId: string) => void;
  toggleInterestArea: (area: InterestArea) => void;
};

export const useDirectoryFilters = create<DirectoryFilterState>((set) => ({
  search: "",
  tier: "all",
  skillIds: [],
  interestAreas: [],
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
}));
