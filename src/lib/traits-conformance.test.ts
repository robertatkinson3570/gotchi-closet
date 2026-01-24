import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import wearablesData from "../../data/wearables.json";
import { computeBRSBreakdown } from "./rarity";

type FixtureGotchi = {
  numericTraits: number[];
  modifiedNumericTraits: number[];
  withSetsNumericTraits?: number[];
  equippedWearables: number[];
};

const fixturesDir = join(process.cwd(), "tests", "fixtures", "gotchis");
const fixtures = readdirSync(fixturesDir).filter((name) => name.endsWith(".json"));

const wearablesById = new Map(
  (wearablesData as any[]).map((w) => [Number(w.id), w])
);

describe("traits conformance", () => {
  it("fallback local finalTraits matches canonical modifiedNumericTraits", () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const file of fixtures) {
      const raw = readFileSync(join(fixturesDir, file), "utf8");
      const gotchi = JSON.parse(raw) as FixtureGotchi;

      const withCanonical = computeBRSBreakdown({
        baseTraits: gotchi.numericTraits,
        modifiedNumericTraits: gotchi.modifiedNumericTraits,
        withSetsNumericTraits: gotchi.withSetsNumericTraits,
        equippedWearables: gotchi.equippedWearables,
        wearablesById,
      });

      const fallbackOnly = computeBRSBreakdown({
        baseTraits: gotchi.numericTraits,
        equippedWearables: gotchi.equippedWearables,
        wearablesById,
      });

      const canonical = gotchi.withSetsNumericTraits ?? gotchi.modifiedNumericTraits;
      expect(withCanonical.finalTraits).toEqual(canonical);
      expect(fallbackOnly.finalTraits).toEqual(canonical);
    }
  });
});

