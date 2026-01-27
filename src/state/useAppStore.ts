import { create } from "zustand";
import type { Gotchi, Wearable, WearableSet, EditorInstance, WearableFilters, WearableMode } from "@/types";
import type { BaazaarPriceMap } from "@/lib/baazaar";
import {
  type LockedOverride,
  loadLockedBuilds,
  saveLockedBuilds,
  cleanupStaleLockedBuilds,
} from "@/lib/lockedBuilds";

const BASE_CHAIN_ID = 8453;

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
  
  // Baazaar
  baazaarPrices: BaazaarPriceMap;
  baazaarLoading: boolean;
  baazaarError: string | null;

  // Filters
  filters: WearableFilters;

  // Locked builds
  lockedById: Record<string, boolean>;
  overridesById: Record<string, LockedOverride>;

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
  setBaazaarPrices: (prices: BaazaarPriceMap) => void;
  setBaazaarLoading: (loading: boolean) => void;
  setBaazaarError: (error: string | null) => void;
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

  // Locked builds actions
  isLocked: (gotchiId: string) => boolean;
  getOverride: (gotchiId: string) => LockedOverride | null;
  lockGotchi: (gotchiId: string, override: LockedOverride) => void;
  unlockGotchi: (gotchiId: string) => void;
  loadLockedBuildsFromStorage: () => void;
}

const getInitialWearableMode = (): WearableMode => {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = localStorage.getItem('gc_wearableMode');
    if (stored === 'owned' || stored === 'baazaar') return stored;
    if (localStorage.getItem('gc_ownedWearablesOnly') === 'true') return 'owned';
    return 'all';
  } catch {
    return 'all';
  }
};

const initialFilters: WearableFilters = {
  search: "",
  slot: null,
  rarity: null,
  set: null,
  showMissingOnly: false,
  traitDirections: null,
  ownedOnly: false,
  wearableMode: getInitialWearableMode(),
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
  baazaarPrices: {},
  baazaarLoading: false,
  baazaarError: null,
  filters: initialFilters,
  lockedById: {},
  overridesById: {},
  loadingGotchis: false,
  loadingWearables: false,
  loadingSets: false,
  error: null,

  setLoadedAddress: (address) => set({ loadedAddress: address }),
  setGotchis: (gotchis) => {
    set({ gotchis });
    const state = get();
    if (state.loadedAddress) {
      const gotchiIds = new Set(gotchis.map((g) => g.id));
      const cleaned = cleanupStaleLockedBuilds(
        { version: 1, lockedById: state.lockedById, overridesById: state.overridesById },
        gotchiIds
      );
      set({ lockedById: cleaned.lockedById, overridesById: cleaned.overridesById });
      saveLockedBuilds(BASE_CHAIN_ID, state.loadedAddress, cleaned);
    }
  },
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
  setBaazaarPrices: (prices) => set({ baazaarPrices: prices }),
  setBaazaarLoading: (loading) => set({ baazaarLoading: loading }),
  setBaazaarError: (error) => set({ baazaarError: error }),
  setFilters: (filters) =>
    set((state) => {
      const newFilters = { ...state.filters, ...filters };
      if (filters.wearableMode !== undefined) {
        try {
          localStorage.setItem('gc_wearableMode', filters.wearableMode);
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

  isLocked: (gotchiId: string) => {
    return !!get().lockedById[gotchiId];
  },

  getOverride: (gotchiId: string) => {
    return get().overridesById[gotchiId] || null;
  },

  lockGotchi: (gotchiId: string, override: LockedOverride) => {
    const state = get();
    const newLockedById = { ...state.lockedById, [gotchiId]: true };
    const newOverridesById = { ...state.overridesById, [gotchiId]: override };
    set({ lockedById: newLockedById, overridesById: newOverridesById });
    if (state.loadedAddress) {
      saveLockedBuilds(BASE_CHAIN_ID, state.loadedAddress, {
        version: 1,
        lockedById: newLockedById,
        overridesById: newOverridesById,
      });
    }
  },

  unlockGotchi: (gotchiId: string) => {
    const state = get();
    const newLockedById = { ...state.lockedById };
    const newOverridesById = { ...state.overridesById };
    delete newLockedById[gotchiId];
    delete newOverridesById[gotchiId];
    set({ lockedById: newLockedById, overridesById: newOverridesById });
    if (state.loadedAddress) {
      saveLockedBuilds(BASE_CHAIN_ID, state.loadedAddress, {
        version: 1,
        lockedById: newLockedById,
        overridesById: newOverridesById,
      });
    }
  },

  loadLockedBuildsFromStorage: () => {
    const state = get();
    if (!state.loadedAddress) return;
    const data = loadLockedBuilds(BASE_CHAIN_ID, state.loadedAddress);
    set({ lockedById: data.lockedById, overridesById: data.overridesById });
  },
}));

