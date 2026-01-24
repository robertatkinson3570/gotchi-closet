import { describe, expect, it } from "vitest";
import {
  traitToBRS,
  traitsToBRS,
  wearableFlatBrs,
  setRarityDelta,
  computeTotalBRS,
} from "./rarity";
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

