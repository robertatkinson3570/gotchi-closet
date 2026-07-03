import { create } from "zustand";
import type { Gotchi, Wearable, WearableSet, EditorInstance, WearableFilters, WearableMode } from "@/types";
import type { BaazaarPriceMap } from "@/lib/baazaar";
import {
  type LockedOverride,
  loadLockedBuilds,
  saveLockedBuilds,
  cleanupStaleLockedBuilds,
} from "@/lib/lockedBuilds";
// Circular with ./selectors (which imports this store) — safe: both sides only
// reference the other's exports at call time, never during module init.
import { computeOwnedCounts } from "./selectors";

const BASE_CHAIN_ID = 8453;

interface AppState {
  // Address & Gotchis
  loadedAddress: string | null;
  gotchis: Gotchi[];
  manualGotchis: Gotchi[]; // Manual gotchis (added via search/Baazaar)
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

  // Wallet-held (unequipped) wearable balances across the loaded wallets,
  // already filtered to category-0 wearables by the producer (audit H4).
  walletItemCounts: Record<number, number>;

  // Loading & Errors
  loadingGotchis: boolean;
  loadingWearables: boolean;
  loadingSets: boolean;
  error: string | null;

  // Actions
  setLoadedAddress: (address: string | null) => void;
  setGotchis: (gotchis: Gotchi[]) => void;
  addManualGotchi: (gotchi: Gotchi) => void;
  removeManualGotchi: (gotchiId: string) => void;
  clearManualGotchis: () => void;
  addEditorInstance: (gotchi: Gotchi) => void;
  removeEditorInstance: (instanceId: string) => void;
  updateEditorInstance: (instanceId: string, equippedBySlot: number[]) => void;
  setWearables: (wearables: Wearable[]) => void;
  setSets: (sets: WearableSet[]) => void;
  setWearableThumbs: (thumbs: Record<number, string>) => void;
  setBaazaarPrices: (prices: BaazaarPriceMap) => void;
  setBaazaarLoading: (loading: boolean) => void;
  setBaazaarError: (error: string | null) => void;
  setWalletItemCounts: (counts: Record<number, number>) => void;
  setFilters: (filters: Partial<WearableFilters>) => void;
  setLoadingGotchis: (loading: boolean) => void;
  setLoadingWearables: (loading: boolean) => void;
  setLoadingSets: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Equips into the instance's slot. Returns false (no-op) when the user owns
   * N > 0 copies and all N are already placed elsewhere (audit M4); wearables
   * owned 0 of equip freely — pure simulation mode. */
  equipWearable: (instanceId: string, wearableId: number, slotIndex: number) => boolean;
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
  // Lock Set helpers (shared API for editor and selector)
  isLockSetEnabled: (gotchiId: string) => boolean;
  setLockSetEnabled: (gotchiId: string, enabled: boolean, override?: LockedOverride) => void;
  toggleLockSet: (gotchiId: string, override?: LockedOverride) => void;
  setLockSetEnabledBulk: (gotchiIds: string[], enabled: boolean) => void;
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
  manualGotchis: [],
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
  walletItemCounts: {},
  loadingGotchis: false,
  loadingWearables: false,
  loadingSets: false,
  error: null,

  setLoadedAddress: (address) => {
    set({ loadedAddress: address });
    if (address) {
      const data = loadLockedBuilds(BASE_CHAIN_ID);
      set({ lockedById: data.lockedById, overridesById: data.overridesById });
    } else {
      set({ lockedById: {}, overridesById: {} });
    }
  },
  setGotchis: (gotchis) => {
    set({ gotchis });
    const state = get();
    // Never clean/persist against an empty list — the DressPage mount reset
    // (setGotchis([])) and transient loading states must not wipe saved locks.
    // Trade-off: this means stale locks for a fully-emptied wallet persist as
    // inert data until a non-empty load arrives to clean them — never wrongly
    // deleting a lock beats eventually cleaning one up.
    if (!state.loadedAddress || gotchis.length === 0) return;
    const keepIds = new Set([
      ...gotchis.map((g) => g.id),
      // Manual gotchis are lockable (toggleLockSet supports them) — keep theirs.
      ...state.manualGotchis.map((g) => g.id),
    ]);
    const cleaned = cleanupStaleLockedBuilds(
      { version: 1, lockedById: state.lockedById, overridesById: state.overridesById },
      keepIds
    );
    set({ lockedById: cleaned.lockedById, overridesById: cleaned.overridesById });
    saveLockedBuilds(BASE_CHAIN_ID, cleaned);
  },
  addManualGotchi: (gotchi) =>
    set((state) => {
      if (state.manualGotchis.some((g) => g.id === gotchi.id)) {
        return state;
      }
      return { manualGotchis: [...state.manualGotchis, gotchi] };
    }),
  removeManualGotchi: (gotchiId) =>
    set((state) => ({
      manualGotchis: state.manualGotchis.filter((g) => g.id !== gotchiId),
    })),
  clearManualGotchis: () => set({ manualGotchis: [] }),
  addEditorInstance: (gotchi) =>
    set((state) => {
      const now = Date.now();
      if (lastAddId === gotchi.id && now - lastAddAt < 250) {
        return state;
      }
      lastAddAt = now;
      lastAddId = gotchi.id;
      const override = state.overridesById[gotchi.id];
      const initialWearables = override?.wearablesBySlot || gotchi.equippedWearables;
      return {
        editorInstances: [
          ...state.editorInstances,
          {
            instanceId: `${gotchi.id}-${now}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            baseGotchi: gotchi,
            equippedBySlot: [...initialWearables],
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
  setWalletItemCounts: (counts) => set({ walletItemCounts: counts }),
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
    if (!instance) return false;

    // Ownership enforcement (audit M4): if the user owns N > 0 copies, at most
    // N may be placed across all editor instances. Moving a copy within this
    // instance (its old slot gets vacated by this same call) doesn't count.
    // owned === 0 stays freely equippable: pure simulation mode (the Save
    // feature classifies those as buy/blocked).
    const owned =
      computeOwnedCounts(state.gotchis, state.walletItemCounts)[wearableId] || 0;
    if (owned > 0) {
      let usedElsewhere = 0;
      for (const inst of state.editorInstances) {
        for (let i = 0; i < inst.equippedBySlot.length; i++) {
          if (inst.equippedBySlot[i] !== wearableId) continue;
          const vacatedByThisCall =
            inst.instanceId === instanceId &&
            // same-instance occurrences are cleared by the loop below…
            !((i === 4 || i === 5) && (slotIndex === 4 || slotIndex === 5) && i !== slotIndex);
            // …EXCEPT the other hand slot, which is deliberately kept (dual-wield).
          if (!vacatedByThisCall) usedElsewhere += 1;
        }
      }
      if (usedElsewhere + 1 > owned) return false;
    }

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
    return true;
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
        ownedOnly: state.filters.ownedOnly,
        wearableMode: state.filters.wearableMode,
        slot: state.filters.slot,
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
      saveLockedBuilds(BASE_CHAIN_ID, {
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
      saveLockedBuilds(BASE_CHAIN_ID, {
        version: 1,
        lockedById: newLockedById,
        overridesById: newOverridesById,
      });
    }
  },

  loadLockedBuildsFromStorage: () => {
    const state = get();
    if (!state.loadedAddress) return;
    const data = loadLockedBuilds(BASE_CHAIN_ID);
    set({ lockedById: data.lockedById, overridesById: data.overridesById });
  },

  // Lock Set helpers (shared API for editor and selector)
  isLockSetEnabled: (gotchiId: string) => {
    return !!get().lockedById[gotchiId];
  },

  setLockSetEnabled: (gotchiId: string, enabled: boolean, override?: LockedOverride) => {
    if (enabled) {
      // If override not provided, try to get from existing override or get from gotchi
      const state = get();
      const existingOverride = state.overridesById[gotchiId];
      let finalOverride = override || existingOverride;
      
      // If still no override, try to get equipped wearables from gotchi
      if (!finalOverride) {
        const gotchi = state.gotchis.find(g => g.id === gotchiId) 
          || state.manualGotchis.find(g => g.id === gotchiId);
        if (gotchi) {
          finalOverride = {
            wearablesBySlot: [...gotchi.equippedWearables],
            respecAllocated: null,
            timestamp: Date.now(),
          };
        } else {
          // Fallback to empty override if gotchi not found
          finalOverride = {
            wearablesBySlot: [],
            respecAllocated: null,
            timestamp: Date.now(),
          };
        }
      }
      
      get().lockGotchi(gotchiId, finalOverride);
    } else {
      get().unlockGotchi(gotchiId);
    }
  },

  toggleLockSet: (gotchiId: string, override?: LockedOverride) => {
    const state = get();
    const isCurrentlyLocked = !!state.lockedById[gotchiId];
    if (isCurrentlyLocked) {
      get().unlockGotchi(gotchiId);
    } else {
      // If override not provided, try to get from existing override or get from gotchi
      let finalOverride = override || state.overridesById[gotchiId];
      
      // If still no override, try to get equipped wearables from gotchi
      if (!finalOverride) {
        const gotchi = state.gotchis.find(g => g.id === gotchiId) 
          || state.manualGotchis.find(g => g.id === gotchiId);
        if (gotchi) {
          finalOverride = {
            wearablesBySlot: [...gotchi.equippedWearables],
            respecAllocated: null,
            timestamp: Date.now(),
          };
        } else {
          // Fallback to empty override if gotchi not found
          finalOverride = {
            wearablesBySlot: [],
            respecAllocated: null,
            timestamp: Date.now(),
          };
        }
      }
      
      get().lockGotchi(gotchiId, finalOverride);
    }
  },

  setLockSetEnabledBulk: (gotchiIds: string[], enabled: boolean) => {
    const state = get();
    const newLockedById = { ...state.lockedById };
    const newOverridesById = { ...state.overridesById };
    
    if (enabled) {
      // Lock all: create overrides for gotchis that don't have them
      for (const gotchiId of gotchiIds) {
        if (!newLockedById[gotchiId]) {
          newLockedById[gotchiId] = true;
          // Try to get equipped wearables from both gotchis and manualGotchis arrays
          // (Baazaar gotchis are in manualGotchis)
          const gotchi = state.gotchis.find(g => g.id === gotchiId) 
            || state.manualGotchis.find(g => g.id === gotchiId);
          if (gotchi && !newOverridesById[gotchiId]) {
            newOverridesById[gotchiId] = {
              wearablesBySlot: [...gotchi.equippedWearables],
              respecAllocated: null,
              timestamp: Date.now(),
            };
          }
        }
      }
    } else {
      // Unlock all
      for (const gotchiId of gotchiIds) {
        delete newLockedById[gotchiId];
        delete newOverridesById[gotchiId];
      }
    }
    
    set({ lockedById: newLockedById, overridesById: newOverridesById });
    if (state.loadedAddress) {
      saveLockedBuilds(BASE_CHAIN_ID, {
        version: 1,
        lockedById: newLockedById,
        overridesById: newOverridesById,
      });
    }
  },
}));

