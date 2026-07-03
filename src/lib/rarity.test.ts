import { describe, expect, it } from "vitest";
import {
  traitToBRS,
  traitsToBRS,
  wearableFlatBrs,
  setRarityDelta,
  computeTotalBRS,
  pickBestSet,
  detectActiveSets,
  computeBRSBreakdown,
} from "./rarity";
import type { SetDefinition } from "./sets";
import { ageBRSFromBlocksElapsed } from "./age";
import { getCanonicalModifiedTraits } from "./traits";

describe("traitToBRS", () => {
  it("handles boundary values", () => {
    expect(traitToBRS(0)).toBe(100);
    expect(traitToBRS(49)).toBe(51);
    expect(traitToBRS(50)).toBe(51);
    expect(traitToBRS(99)).toBe(100);
    expect(traitToBRS(100)).toBe(101);
    expect(traitToBRS(-1)).toBe(101);
    expect(traitToBRS(120)).toBe(121);
  });
});

describe("traitsToBRS", () => {
  it("sums all 6 traits", () => {
    expect(traitsToBRS([50, 50, 50, 50, 50, 50])).toBe(306);
  });
});

describe("wearableFlatBrs", () => {
  it("maps rarity tiers", () => {
    expect(wearableFlatBrs("common")).toBe(1);
    expect(wearableFlatBrs("uncommon")).toBe(2);
    expect(wearableFlatBrs("rare")).toBe(5);
    expect(wearableFlatBrs("legendary")).toBe(10);
    expect(wearableFlatBrs("mythical")).toBe(20);
    expect(wearableFlatBrs("godlike")).toBe(50);
  });
});

describe("ageBRSFromBlocksElapsed", () => {
  it("uses milestone table", () => {
    expect(ageBRSFromBlocksElapsed(0)).toBe(0);
    expect(ageBRSFromBlocksElapsed(999_999)).toBe(0);
    expect(ageBRSFromBlocksElapsed(1_000_000)).toBe(1);
    expect(ageBRSFromBlocksElapsed(55_000_000)).toBe(9);
    expect(ageBRSFromBlocksElapsed(89_000_000)).toBe(10);
  });
});

describe("wiki example totals", () => {
  it("matches example from rarity-farming page", () => {
    const traits = [61, 78, 27, 99, 8, 77];
    const traitBRS = traitsToBRS(traits);
    expect(traitBRS).toBe(484);
    const total = traitBRS + wearableFlatBrs("rare") + wearableFlatBrs("godlike");
    expect(total).toBe(539);
  });
});

describe("setRarityDelta", () => {
  it("adds flat BRS and trait delta", () => {
    const baseTraits = [50, 50, 50, 50, 8, 13];
    const setFlatBRS = 5;
    const delta = setRarityDelta({
      baseTraits,
      wearableTraitMods: {},
      setTraitMods: { spk: 3 },
      setFlatBRS,
    });
    const traitsWithWearables = traitsToBRS(baseTraits);
    const traitsWithSet = traitsToBRS([50, 50, 53, 50, 8, 13]);
    expect(delta).toBe(setFlatBRS + (traitsWithSet - traitsWithWearables));
  });
});

describe("totalBRS sanity", () => {
  it("changes only by wearable flat + set delta + age", () => {
    const baseTraits = [50, 40, 60, 55, 10, 20];
    const wearableTraitMods = { nrg: 2, agg: -1 };
    const setTraitMods = { spk: 3 };
    const wearableFlatBRS = 10;
    const setBonusBRS = 5;
    const ageBRS = 2;

    const total = computeTotalBRS({
      baseTraits,
      wearableTraitMods,
      wearableFlatBRS,
      setTraitMods,
      setFlatBRS: setBonusBRS,
      ageBRS,
    });

    const traitWithMods = traitsToBRS([
      baseTraits[0] + wearableTraitMods.nrg!,
      baseTraits[1] + wearableTraitMods.agg!,
      baseTraits[2] + setTraitMods.spk!,
      baseTraits[3],
      baseTraits[4],
      baseTraits[5],
    ]);

    expect(total).toBe(
      traitWithMods + wearableFlatBRS + setBonusBRS + ageBRS
    );
  });
});

describe("best-set rule (audit H1)", () => {
  it("pickBestSet picks the longest set; ties go to the later (higher index) set", () => {
    const sets = [
      { id: "a", name: "A", requiredWearableIds: [1, 2], traitModifiers: {}, setBonusBRS: 1 },
      { id: "b", name: "B", requiredWearableIds: [1, 2, 3], traitModifiers: {}, setBonusBRS: 2 },
      { id: "c", name: "C", requiredWearableIds: [4, 5, 6], traitModifiers: {}, setBonusBRS: 3 },
    ] as SetDefinition[];
    expect(pickBestSet(sets)?.id).toBe("c"); // same length as b → later wins
    expect(pickBestSet(sets.slice(0, 2))?.id).toBe("b");
    expect(pickBestSet([])).toBeNull();
  });

  it("computeBRSBreakdown counts only the best set when a superset outfit matches 2 sets", () => {
    // Real subset pair from data/wearableSets.json:
    // Aagent       requires [55, 56, 57, 58]      → bonuses [-1, 0, 1, 0], flat 3
    // Super Aagent requires [55, 56, 57, 58, 59]  → bonuses [-1, 0, 2, 0], flat 4
    const equipped = [55, 56, 57, 58, 59];
    const matched = detectActiveSets(equipped);
    expect(matched.map((s) => s.name).sort()).toEqual(["Aagent", "Super Aagent"]);

    const breakdown = computeBRSBreakdown({
      baseTraits: [50, 50, 50, 50, 10, 20],
      equippedWearables: equipped,
      wearablesById: new Map(),
    });
    // Only Super Aagent counts — not the sum of both (3 + 4 = 7).
    expect(breakdown.bestSet?.name).toBe("Super Aagent");
    expect(breakdown.setFlatBrs).toBe(4);
    // Trait mods come only from the best set.
    expect(breakdown.setTraitMods).toEqual({ nrg: -1, agg: 0, spk: 2, brn: 0 });
    // All matches remain available for display.
    expect(breakdown.activeSets).toHaveLength(2);
    // Final traits reflect only the single set's modifiers.
    expect(breakdown.finalTraits).toEqual([49, 50, 52, 50, 10, 20]);
  });
});

describe("getCanonicalModifiedTraits", () => {
  it("uses modifiedNumericTraits when valid", () => {
    const base = [1, 2, 3, 4, 5, 6];
    const modified = [6, 5, 4, 3, 2, 1];
    const local = [9, 9, 9, 9, 9, 9];
    expect(getCanonicalModifiedTraits(base, modified, local)).toEqual(modified);
  });

  it("falls back to local computed traits when modified is invalid", () => {
    const base = [1, 2, 3, 4, 5, 6];
    const modified = [6, 5, 4]; // invalid length
    const local = [9, 9, 9, 9, 9, 9];
    expect(getCanonicalModifiedTraits(base, modified, local)).toEqual(local);
  });
});

