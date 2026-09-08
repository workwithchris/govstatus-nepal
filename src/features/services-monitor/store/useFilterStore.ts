"use client";

import { create } from "zustand";

import type { CategoryFilter, SortBy } from "@/features/services-monitor/types";

export type ViewMode = "grid" | "table";

interface FilterState {
  searchQuery: string;
  selectedCategory: CategoryFilter;
  sortBy: SortBy;
  view: ViewMode;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: CategoryFilter) => void;
  setSortBy: (sort: SortBy) => void;
  setView: (view: ViewMode) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  searchQuery: "",
  selectedCategory: "all",
  sortBy: "status",
  view: "grid",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSortBy: (sortBy) => set({ sortBy }),
  setView: (view) => set({ view }),
}));
