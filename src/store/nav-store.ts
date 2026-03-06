import { create } from 'zustand';

interface NavState {
  targetPage: number | null;
  navigateTo: (page: number) => void;
  clearTarget: () => void;
}

export const useNavStore = create<NavState>((set) => ({
  targetPage: null,
  navigateTo: (page) => set({ targetPage: page }),
  clearTarget: () => set({ targetPage: null }),
}));

// Page indices
export const PAGE_PROJECTS = 0;
export const PAGE_HOME = 1;
export const PAGE_PROGRESS = 2;
