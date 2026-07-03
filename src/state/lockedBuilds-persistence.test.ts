import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "@/state/useAppStore";
import type { Gotchi } from "@/types";

// vitest runs this suite in a plain Node environment (no jsdom/happy-dom
// dependency in the repo), so `localStorage` isn't ambiently available.
// Shim it with an in-memory Map — lockedBuilds.ts talks to the real
// localStorage API surface (getItem/setItem/removeItem/clear/length/key) only.
if (typeof globalThis.localStorage === "undefined") {
  const backing = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key: string, value: string) => {
      backing.set(key, String(value));
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => {
      backing.clear();
    },
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    get length() {
      return backing.size;
    },
  };
}

const g = (id: string): Gotchi => ({
  id, name: `G${id}`, numericTraits: [50, 50, 50, 50, 1, 1], equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0],
});
const override = { wearablesBySlot: [1, 0, 0, 0, 0, 0, 0, 0], respecAllocated: null, timestamp: 1 };

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ gotchis: [], manualGotchis: [], lockedById: {}, overridesById: {}, loadedAddress: null });
});

describe("locked build persistence (audit C1)", () => {
  it("setGotchis([]) does not purge or persist-wipe existing locks", () => {
    useAppStore.getState().setLoadedAddress("0xabc");
    useAppStore.getState().setGotchis([g("1")]);
    useAppStore.getState().lockGotchi("1", override);
    // Simulates the DressPage mount reset:
    useAppStore.getState().setGotchis([]);
    expect(useAppStore.getState().lockedById["1"]).toBe(true);
    // reload from storage — must still be there
    useAppStore.getState().loadLockedBuildsFromStorage();
    expect(useAppStore.getState().lockedById["1"]).toBe(true);
  });

  it("locks on manual gotchis survive wallet refetches", () => {
    useAppStore.getState().setLoadedAddress("0xabc");
    useAppStore.getState().addManualGotchi(g("999"));
    useAppStore.getState().lockGotchi("999", override);
    useAppStore.getState().setGotchis([g("1")]); // wallet refetch without 999
    expect(useAppStore.getState().lockedById["999"]).toBe(true);
  });

  it("stale locks are still cleaned once a real gotchi list arrives", () => {
    useAppStore.getState().setLoadedAddress("0xabc");
    useAppStore.getState().setGotchis([g("1"), g("2")]);
    useAppStore.getState().lockGotchi("2", override);
    useAppStore.getState().setGotchis([g("1")]); // gotchi 2 left the wallet
    expect(useAppStore.getState().lockedById["2"]).toBeUndefined();
  });

  it("locks survive a wallet-set change (storage not keyed to the combo)", () => {
    useAppStore.getState().setLoadedAddress("0xabc|0xdef");
    useAppStore.getState().setGotchis([g("1")]);
    useAppStore.getState().lockGotchi("1", override);
    // wallet added → different composite key
    useAppStore.getState().setLoadedAddress("0xabc|0xdef|0x123");
    expect(useAppStore.getState().lockedById["1"]).toBe(true);
  });
});
