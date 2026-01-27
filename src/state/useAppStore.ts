import { create } from "zustand";
import type { Gotchi, Wearable, WearableSet, EditorInstance, WearableFilters } from "@/types";

interface AppState {
  // Address & Gotchis
  loadedAddress: string | null;
  gotchis: Gotchi[];
  // Editor
  editorInstances: EditorInstance[];

  // Wearables & Sets
  wearables: Wearable[];
  sets: WearableSet[];
  wearableThumbs: Record<number, string>;

  // Filters
  filters: WearableFilters;

  // Loading & Errors
  loadingGotchis: boolean;
  loadingWearables: boolean;
  loadingSets: boolean;
  error: string | null;

  // Actions
  setLoadedAddress: (address: string | null) => void;
  setGotchis: (gotchis: Gotchi[]) => void;
  addEditorInstance: (gotchi: Gotchi) => void;
  removeEditorInstance: (instanceId: string) => void;
  updateEditorInstance: (instanceId: string, equippedBySlot: number[]) => void;
  setWearables: (wearables: Wearable[]) => void;
  setSets: (sets: WearableSet[]) => void;
  setWearableThumbs: (thumbs: Record<number, string>) => void;
  setFilters: (filters: Partial<WearableFilters>) => void;
  setLoadingGotchis: (loading: boolean) => void;
  setLoadingWearables: (loading: boolean) => void;
  setLoadingSets: (loading: boolean) => void;
  setError: (error: string | null) => void;
  equipWearable: (instanceId: string, wearableId: number, slotIndex: number) => void;
  unequipSlot: (instanceId: string, slotIndex: number) => void;
  stripAllWearables: (instanceId: string) => void;
  restoreOriginalWearables: (instanceId: string) => void;
  clearFilters: () => void;
}

const getInitialOwnedOnly = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('gc_ownedWearablesOnly') === 'true';
  } catch {
    return false;
  }
};

const initialFilters: WearableFilters = {
  search: "",
  slot: null,
  rarity: null,
  set: null,
  showMissingOnly: false,
  traitDirections: null,
  ownedOnly: getInitialOwnedOnly(),
};

let lastAddAt = 0;
let lastAddId = "";

export const useAppStore = create<AppState>((set, get) => ({
  loadedAddress: null,
  gotchis: [],
  editorInstances: [],
  wearables: [],
  sets: [],
  wearableThumbs: {},
  filters: initialFilters,
  loadingGotchis: false,
  loadingWearables: false,
  loadingSets: false,
  error: null,

  setLoadedAddress: (address) => set({ loadedAddress: address }),
  setGotchis: (gotchis) => set({ gotchis }),
  addEditorInstance: (gotchi) =>
    set((state) => {
      const now = Date.now();
      if (lastAddId === gotchi.id && now - lastAddAt < 250) {
        return state;
      }
      lastAddAt = now;
      lastAddId = gotchi.id;
      return {
        editorInstances: [
          ...state.editorInstances,
          {
            instanceId: `${gotchi.id}-${now}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            baseGotchi: gotchi,
            equippedBySlot: [...gotchi.equippedWearables],
          },
        ],
      };
    }),
  removeEditorInstance: (instanceId) =>
    set((state) => ({
      editorInstances: state.editorInstances.filter(
        (instance) => instance.instanceId !== instanceId
      ),
    })),
  updateEditorInstance: (instanceId, equippedBySlot) =>
    set((state) => ({
      editorInstances: state.editorInstances.map((instance) =>
        instance.instanceId === instanceId
          ? { ...instance, equippedBySlot }
          : instance
      ),
    })),
  setWearables: (wearables) => set({ wearables }),
  setSets: (sets) => set({ sets }),
  setWearableThumbs: (thumbs) =>
    set((state) => ({ wearableThumbs: { ...state.wearableThumbs, ...thumbs } })),
  setFilters: (filters) =>
    set((state) => {
      const newFilters = { ...state.filters, ...filters };
      if (filters.ownedOnly !== undefined) {
        try {
          localStorage.setItem('gc_ownedWearablesOnly', String(filters.ownedOnly));
        } catch {}
      }
      return { filters: newFilters };
    }),
  setLoadingGotchis: (loading) => set({ loadingGotchis: loading }),
  setLoadingWearables: (loading) => set({ loadingWearables: loading }),
  setLoadingSets: (loading) => set({ loadingSets: loading }),
  setError: (error) => set({ error }),

  equipWearable: (instanceId, wearableId, slotIndex) => {
    const state = get();
    const instance = state.editorInstances.find(
      (item) => item.instanceId === instanceId
    );
    if (!instance) return;

    const equippedBySlot = [...instance.equippedBySlot];
    const isHandSlot = slotIndex === 4 || slotIndex === 5;

    for (let i = 0; i < equippedBySlot.length; i++) {
      if (equippedBySlot[i] === wearableId) {
        if (isHandSlot && i !== slotIndex && (i === 4 || i === 5)) {
          continue;
        }
        equippedBySlot[i] = 0;
      }
    }

    equippedBySlot[slotIndex] = wearableId;

    set({
      editorInstances: state.editorInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, equippedBySlot }
          : item
      ),
    });
  },

  unequipSlot: (instanceId, slotIndex) => {
    const state = get();
    const instance = state.editorInstances.find(
      (item) => item.instanceId === instanceId
    );
    if (!instance) return;

    const equippedBySlot = [...instance.equippedBySlot];
    equippedBySlot[slotIndex] = 0;

    set({
      editorInstances: state.editorInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, equippedBySlot }
          : item
      ),
    });
  },

  stripAllWearables: (instanceId) => {
    const state = get();
    const instance = state.editorInstances.find(
      (item) => item.instanceId === instanceId
    );
    if (!instance) return;

    const equippedBySlot = instance.equippedBySlot.map(() => 0);

    set({
      editorInstances: state.editorInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, equippedBySlot }
          : item
      ),
    });
  },

  restoreOriginalWearables: (instanceId) => {
    const state = get();
    const instance = state.editorInstances.find(
      (item) => item.instanceId === instanceId
    );
    if (!instance) return;

    set({
      editorInstances: state.editorInstances.map((item) =>
        item.instanceId === instanceId
          ? { ...item, equippedBySlot: [...instance.baseGotchi.equippedWearables] }
          : item
      ),
    });
  },

  clearFilters: () => {
    set((state) => ({ 
      filters: { 
        ...initialFilters, 
        ownedOnly: state.filters.ownedOnly 
      } 
    }));
  },
}));

