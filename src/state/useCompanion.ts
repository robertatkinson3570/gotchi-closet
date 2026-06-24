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
  // In-character lines pushed programmatically and shown as assistant bubbles (e.g. the
  // Steward page: the gotchi begs for work, then chats through each recruit-wizard step).
  script: string[];
  setSelected: (id: string) => void;
  toggleOpen: () => void;
  setOpen: (v: boolean) => void;
  setDraft: (v: string) => void;
  ensureDefault: (gotchis: Gotchi[]) => void;
  setRoastOpen: (v: boolean) => void;
  openWith: (id: string, firstLine?: string) => void;
  say: (line: string) => void;
  clearScript: () => void;
}

export const useCompanion = create<CompanionState>((set, get) => ({
  selectedTokenId: typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null,
  isOpen: false,
  draft: "",
  roastOpen: false,
  script: [],
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
  // Select a gotchi, pop the companion open, and start an in-character script.
  openWith: (id, firstLine) => {
    get().setSelected(id);
    set({ isOpen: true, script: firstLine ? [firstLine] : [] });
  },
  // Append an in-character line (e.g. the gotchi reacting to a recruit-wizard step).
  say: (line) => set((s) => (s.script[s.script.length - 1] === line ? s : { script: [...s.script, line] })),
  clearScript: () => set({ script: [] }),
}));
