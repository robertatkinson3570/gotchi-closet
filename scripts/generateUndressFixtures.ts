import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import wearablesData from "../data/wearables.json";
import { computeBRSBreakdown } from "../src/lib/rarity";

type FixtureCase = {
  name: string;
  baseTraits: number[];
  equippedWearables: number[];
  removeWearableId: number;
};

const wearablesById = new Map(
  (wearablesData as any[]).map((w) => [Number(w.id), w])
);

const cases: FixtureCase[] = [
  {
    name: "no_set_remove_wearable",
    baseTraits: [40, 45, 50, 55, 10, 20],
    equippedWearables: [0, 0, 0, 0, 0, 0, 0, 228],
    removeWearableId: 228,
  },
  {
    name: "set_active_remove_item",
    baseTraits: [50, 50, 50, 50, 50, 50],
    equippedWearables: [30, 31, 32, 0, 0, 0, 0, 0],
    removeWearableId: 30,
  },
];

function breakdownFor(equippedWearables: number[], baseTraits: number[]) {
  return computeBRSBreakdown({
    baseTraits,
    equippedWearables,
    wearablesById,
    blocksElapsed: 0,
  });
}

function computeDelta(before: ReturnType<typeof breakdownFor>, after: ReturnType<typeof breakdownFor>) {
  return {
    traitBRSBase: after.traitBase - before.traitBase,
    traitBRSModified: after.traitWithMods - before.traitWithMods,
    wearableFlatBRS: after.wearableFlat - before.wearableFlat,
    setFlatBRS: after.setFlatBrs - before.setFlatBrs,
    setTraitDelta: after.setTraitDelta - before.setTraitDelta,
    totalBRS: after.totalBrs - before.totalBrs,
  };
}

const outputDir = join("tests", "fixtures", "undress_deltas");
mkdirSync(outputDir, { recursive: true });

for (const fixture of cases) {
  const before = breakdownFor(fixture.equippedWearables, fixture.baseTraits);
  const after = breakdownFor(
    fixture.equippedWearables.map((id) =>
      id === fixture.removeWearableId ? 0 : id
    ),
    fixture.baseTraits
  );
  const expectedDelta = computeDelta(before, after);
  const payload = {
    baseTraits: fixture.baseTraits,
    equippedWearables: fixture.equippedWearables,
    removeWearableId: fixture.removeWearableId,
    expectedDelta,
  };
  writeFileSync(
    join(outputDir, `${fixture.name}.json`),
    JSON.stringify(payload, null, 2)
  );
}

