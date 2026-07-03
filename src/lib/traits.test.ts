import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getCanonicalModifiedTraits } from "./traits";
import { computeBRSBreakdown, traitsToBRS } from "./rarity";

const fixturePath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "gotchi_modified_traits_case.json"
);

function loadFixture() {
  const json = JSON.parse(readFileSync(fixturePath, "utf8"));
  return json.data.user.gotchisOwned[0];
}

describe("canonical modified traits selection", () => {
  // Audit M10 reordered the fallback to withSets ?? local ?? modified ?? base
  // — locally computed traits (which include set bonuses) now outrank the
  // subgraph's wearable-only modifiedNumericTraits, since the latter can't be
  // trusted when it disagrees with what's actually equipped.
  it("uses modifiedNumericTraits when valid and no local computation is available", () => {
    const gotchi = loadFixture();
    const canonical = getCanonicalModifiedTraits(
      gotchi.numericTraits,
      gotchi.modifiedNumericTraits
    );
    expect(canonical).toEqual(gotchi.modifiedNumericTraits);
  });

  it("prefers a valid localComputedTraits over modifiedNumericTraits (audit M10)", () => {
    const gotchi = loadFixture();
    const local = gotchi.numericTraits.slice();
    const canonical = getCanonicalModifiedTraits(
      gotchi.numericTraits,
      gotchi.modifiedNumericTraits,
      local
    );
    expect(canonical).toEqual(local);
    expect(canonical).not.toEqual(gotchi.modifiedNumericTraits);
  });

  it("computeBRSBreakdown scores off the locally computed traits when nothing is equipped, not the subgraph's stale modifiedNumericTraits", () => {
    const gotchi = loadFixture();
    // Fixture's equippedWearables are all 0 — the locally computed traits
    // correctly equal the base traits (no wearable/set mods apply), which is
    // now what canonical selection returns in preference to
    // modifiedNumericTraits.
    const breakdown = computeBRSBreakdown({
      baseTraits: gotchi.numericTraits,
      modifiedNumericTraits: gotchi.modifiedNumericTraits,
      equippedWearables: gotchi.equippedWearables,
      wearablesById: new Map(),
      blocksElapsed: 0,
    });
    const expected = traitsToBRS(gotchi.numericTraits);
    expect(breakdown.traitWithMods).toBe(expected);
  });
});

describe("canonical trait fallback order (audit M10)", () => {
  it("prefers withSets > local > wearables-only (audit M10)", () => {
    const base = [10, 10, 10, 10, 1, 1];
    const modified = [12, 10, 10, 10, 1, 1]; // wearables only (no sets)
    const local = [13, 10, 10, 10, 1, 1]; // wearables + sets, locally computed
    const withSets = [13, 11, 10, 10, 1, 1]; // authoritative
    expect(getCanonicalModifiedTraits(base, modified, local, withSets)).toEqual(withSets);
    // KEY case: no withSets from subgraph → local (has set mods) must beat modified (doesn't)
    expect(getCanonicalModifiedTraits(base, modified, local, undefined)).toEqual(local);
    expect(getCanonicalModifiedTraits(base, modified, undefined, undefined)).toEqual(modified);
    expect(getCanonicalModifiedTraits(base, undefined, undefined, undefined)).toEqual(base);
  });
});

describe("wearable trait order mapping", () => {
  it("applies core modifiers in the correct order", () => {
    const wearablesById = new Map<number, any>([
      [
        1,
        {
          id: 1,
          traitModifiers: [1, 2, 3, 4, 0, 0],
          rarityScoreModifier: 0,
          rarity: "common",
          slotPositions: [],
          category: 0,
        },
      ],
    ]);
    const breakdown = computeBRSBreakdown({
      baseTraits: [0, 0, 0, 0, 0, 0],
      equippedWearables: [1],
      wearablesById,
    });
    expect(breakdown.finalTraits).toEqual([1, 2, 3, 4, 0, 0]);
  });
});

describe("Jordan set swap regression", () => {
  it("matches expected final traits and total BRS for 21403 swap", () => {
    const wearablesPath = join(process.cwd(), "data", "wearables.json");
    const wearablesData = JSON.parse(readFileSync(wearablesPath, "utf8")) as any[];
    const wearablesById = new Map(wearablesData.map((w) => [Number(w.id), w]));

    const baseTraits = [12, 15, 107, 109, 8, 13];
    const equippedWearables = [31, 263, 86, 30, 223, 32, 361, 0];

    const breakdown = computeBRSBreakdown({
      baseTraits,
      equippedWearables,
      wearablesById,
      blocksElapsed: 0,
    });

    expect(traitsToBRS(baseTraits)).toBe(570);
    expect(breakdown.finalTraits).toEqual([9, 5, 120, 115, 8, 13]);
    expect(breakdown.totalBrs).toBe(719);
  });
});

describe("Uncommon Rofl pet trait modifiers regression", () => {
  it("Uncommon Rofl (ID 152) applies exactly NRG -1 and BRN -1, nothing else", () => {
    const wearablesPath = join(process.cwd(), "data", "wearables.json");
    const wearablesData = JSON.parse(readFileSync(wearablesPath, "utf8")) as any[];
    const wearablesById = new Map(wearablesData.map((w) => [Number(w.id), w]));
    
    const uncommonRofl = wearablesById.get(152);
    expect(uncommonRofl).toBeDefined();
    expect(uncommonRofl?.name).toContain("Rofl");
    
    const mods = uncommonRofl?.traitModifiers?.slice(0, 4) || [];
    expect(mods).toEqual([-1, 0, 0, -1]);
  });

  it("applying Uncommon Rofl to gotchi changes only NRG and BRN", () => {
    const wearablesById = new Map<number, any>([
      [
        152,
        {
          id: 152,
          name: "Uncommon Rofl",
          traitModifiers: [-1, 0, 0, -1, 0, 0],
          rarityScoreModifier: 2,
          rarity: "uncommon",
          slotPositions: [false, false, false, false, false, false, true, false],
          category: 0,
        },
      ],
    ]);
    
    const baseTraits = [50, 50, 50, 50, 50, 50];
    const breakdown = computeBRSBreakdown({
      baseTraits,
      equippedWearables: [152],
      wearablesById,
    });
    
    expect(breakdown.wearableTraitMods).toEqual({
      nrg: -1,
      agg: 0,
      spk: 0,
      brn: -1,
    });
    expect(breakdown.finalTraits).toEqual([49, 50, 50, 49, 50, 50]);
  });

  it("all Rofl pets have correct trait modifier pattern (NRG/BRN only)", () => {
    const wearablesPath = join(process.cwd(), "data", "wearables.json");
    const wearablesData = JSON.parse(readFileSync(wearablesPath, "utf8")) as any[];
    
    const roflPets = wearablesData.filter((w: any) => 
      w.name?.toLowerCase().includes("rofl")
    );
    
    expect(roflPets.length).toBeGreaterThan(0);
    
    for (const rofl of roflPets) {
      const mods = rofl.traitModifiers?.slice(0, 4) || [];
      expect(mods[1]).toBe(0);
      expect(mods[2]).toBe(0);
    }
  });
});

