import { create } from "zustand";
import type { Tier } from "@/lib/generated/prisma/enums";

export type DirectoryTierFilter = Tier | "all";

type DirectoryFilterState = {
  search: string;
  tier: DirectoryTierFilter;
  setSearch: (search: string) => void;
  setTier: (tier: DirectoryTierFilter) => void;
};

export const useDirectoryFilters = create<DirectoryFilterState>((set) => ({
  search: "",
  tier: "all",
  setSearch: (search) => set({ search }),
  setTier: (tier) => set({ tier }),
}));
