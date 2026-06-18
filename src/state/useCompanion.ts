import { create } from "zustand";
import type { Gotchi } from "@/types";

const LS_KEY = "companion.selectedTokenId";

export function pickDefaultTokenId(gotchis: Gotchi[]): string | null {
  if (!gotchis.length) return null;
  const brs = (g: Gotchi) => g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0;
  return [...gotchis].sort((a, b) => brs(b) - brs(a))[0].id;
}

interface CompanionState {
  selectedTokenId: string | null;
  isOpen: boolean;
  draft: string;
  roastOpen: boolean;
  setSelected: (id: string) => void;
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setDraft: (v: string) => void;
  ensureDefault: (gotchis: Gotchi[]) => void;
  setRoastOpen: (v: boolean) => void;
}

export const useCompanion = create<CompanionState>((set, get) => ({
  selectedTokenId: typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null,
  isOpen: false,
  draft: "",
  roastOpen: false,
  setSelected: (id) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, id);
    set({ selectedTokenId: id });
  },
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (v) => set({ isOpen: v }),
  setDraft: (v) => set({ draft: v }),
  ensureDefault: (gotchis) => {
    if (get().selectedTokenId) return;
    const id = pickDefaultTokenId(gotchis);
    if (id) get().setSelected(id);
  },
  setRoastOpen: (v) => set({ roastOpen: v }),
}));
