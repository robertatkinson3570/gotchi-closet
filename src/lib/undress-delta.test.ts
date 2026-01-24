import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import wearablesData from "../../data/wearables.json";
import { computeBRSBreakdown } from "./rarity";

type DeltaFixture = {
  baseTraits: number[];
  equippedWearables: number[];
  removeWearableId: number;
  expectedDelta: {
    traitBRSBase: number;
    traitBRSModified: number;
    wearableFlatBRS: number;
    setFlatBRS: number;
    setTraitDelta: number;
    totalBRS: number;
  };
};

const fixturesDir = join(process.cwd(), "tests", "fixtures", "undress_deltas");
const fixtures = readdirSync(fixturesDir).filter((name) => name.endsWith(".json"));

const wearablesById = new Map(
  (wearablesData as any[]).map((w) => [Number(w.id), w])
);

describe("undress delta conformance", () => {
  it("matches expected deltas for single wearable removal", () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const file of fixtures) {
      const raw = readFileSync(join(fixturesDir, file), "utf8");
      const fixture = JSON.parse(raw) as DeltaFixture;

      const before = computeBRSBreakdown({
        baseTraits: fixture.baseTraits,
        equippedWearables: fixture.equippedWearables,
        wearablesById,
        blocksElapsed: 0,
      });
      const after = computeBRSBreakdown({
        baseTraits: fixture.baseTraits,
        equippedWearables: fixture.equippedWearables.map((id) =>
          id === fixture.removeWearableId ? 0 : id
        ),
        wearablesById,
        blocksElapsed: 0,
      });

      const delta = {
        traitBRSBase: after.traitBase - before.traitBase,
        traitBRSModified: after.traitWithMods - before.traitWithMods,
        wearableFlatBRS: after.wearableFlat - before.wearableFlat,
        setFlatBRS: after.setFlatBrs - before.setFlatBrs,
        setTraitDelta: after.setTraitDelta - before.setTraitDelta,
        totalBRS: after.totalBrs - before.totalBrs,
      };

      expect(delta).toEqual(fixture.expectedDelta);
    }
  });
});

