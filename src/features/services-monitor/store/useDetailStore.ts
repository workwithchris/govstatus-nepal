"use client";

import { create } from "zustand";

interface DetailState {
  /** Service currently opened in the detail dialog, if any. */
  selectedServiceId: string | null;
  setSelectedServiceId: (id: string | null) => void;
}

export const useDetailStore = create<DetailState>((set) => ({
  selectedServiceId: null,
  setSelectedServiceId: (selectedServiceId) => set({ selectedServiceId }),
}));
