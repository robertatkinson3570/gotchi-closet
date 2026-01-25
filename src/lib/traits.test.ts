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
  it("uses modifiedNumericTraits when valid", () => {
    const gotchi = loadFixture();
    const local = gotchi.numericTraits.slice();
    const canonical = getCanonicalModifiedTraits(
      gotchi.numericTraits,
      gotchi.modifiedNumericTraits,
      local
    );
    expect(canonical).toEqual(gotchi.modifiedNumericTraits);
    expect(canonical).not.toEqual(local);
  });

  it("feeds rarity scoring from modifiedNumericTraits when present", () => {
    const gotchi = loadFixture();
    const breakdown = computeBRSBreakdown({
      baseTraits: gotchi.numericTraits,
      modifiedNumericTraits: gotchi.modifiedNumericTraits,
      equippedWearables: gotchi.equippedWearables,
      wearablesById: new Map(),
      blocksElapsed: 0,
    });
    const expected = traitsToBRS(gotchi.modifiedNumericTraits);
    expect(breakdown.traitWithMods).toBe(expected);
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

