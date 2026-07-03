import { describe, expect, it } from "vitest";
import { computeOwnedCounts, computeWearableInventory } from "@/state/selectors";
import type { Gotchi, EditorInstance } from "@/types";

const g = (id: string, equipped: number[]): Gotchi =>
  ({ id, name: `G${id}`, numericTraits: [], equippedWearables: equipped } as unknown as Gotchi);

const inst = (gotchi: Gotchi, equippedBySlot: number[]): EditorInstance => ({
  instanceId: `${gotchi.id}-inst`,
  baseGotchi: gotchi,
  equippedBySlot,
});

const emptyInventoryState = {
  gotchis: [] as Gotchi[],
  editorInstances: [] as EditorInstance[],
  lockedById: {},
  overridesById: {},
  walletItemCounts: {},
};

describe("owned counts (audit H4)", () => {
  it("adds wallet-held balances on top of equipped counts", () => {
    const gotchis = [g("1", [10, 0])];
    expect(computeOwnedCounts(gotchis, { 10: 2, 55: 1 })).toEqual({ 10: 3, 55: 1 });
  });

  it("defaults to equipped-only when no wallet map is given", () => {
    expect(computeOwnedCounts([g("1", [10, 10, 0])])).toEqual({ 10: 2 });
  });
});

describe("manual gotchis are preview-only (audit H7)", () => {
  it("does not count a manual gotchi's wearables as owned", () => {
    const inv = computeWearableInventory({
      ...emptyInventoryState,
      gotchis: [g("1", [10, 0])],
      manualGotchis: [g("2", [20, 0])],
    });
    expect(inv.ownedCounts).toEqual({ 10: 1 });
  });

  it("a gotchi both manual and in a wallet counts once", () => {
    const inv = computeWearableInventory({
      ...emptyInventoryState,
      gotchis: [g("1", [10, 0])],
      manualGotchis: [g("1", [10, 0])],
    });
    expect(inv.ownedCounts).toEqual({ 10: 1 });
  });

  it("an editor instance of a manual gotchi still consumes used counts", () => {
    const manual = g("2", [0, 0]);
    const inv = computeWearableInventory({
      ...emptyInventoryState,
      gotchis: [g("1", [10, 0])],
      manualGotchis: [manual],
      editorInstances: [inst(manual, [10, 0])],
    });
    expect(inv.ownedCounts).toEqual({ 10: 1 });
    expect(inv.usedCounts).toEqual({ 10: 1 });
    expect(inv.availCounts).toEqual({ 10: 0 });
  });
});
