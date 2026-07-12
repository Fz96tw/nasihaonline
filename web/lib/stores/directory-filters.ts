import { create } from "zustand";
import type { Tier } from "@/lib/generated/prisma/enums";

export type DirectoryTierFilter = Tier | "all";

type DirectoryFilterState = {
  search: string;
  tier: DirectoryTierFilter;
  // Selected Skill ids (§4.3/§4.5/§7.3) — a member matches if they have ANY
  // of the selected skills (empty = no filtering).
  skillIds: string[];
  setSearch: (search: string) => void;
  setTier: (tier: DirectoryTierFilter) => void;
  toggleSkill: (skillId: string) => void;
};

export const useDirectoryFilters = create<DirectoryFilterState>((set) => ({
  search: "",
  tier: "all",
  skillIds: [],
  setSearch: (search) => set({ search }),
  setTier: (tier) => set({ tier }),
  toggleSkill: (skillId) =>
    set((state) => ({
      skillIds: state.skillIds.includes(skillId)
        ? state.skillIds.filter((id) => id !== skillId)
        : [...state.skillIds, skillId],
    })),
}));
