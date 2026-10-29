import { create } from 'zustand';
export const useUpdateStore = create<{ available: boolean; updating: boolean; error: string | null }>(() => ({ available: false, updating: false, error: null }));
