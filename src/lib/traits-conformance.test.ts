import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import wearablesData from "../../data/wearables.json";
import { computeBRSBreakdown } from "./rarity";
import { PATCHED_WEARABLE_IDS } from "@/graphql/fetchers";

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
  it("uses canonical subgraph traits when provided (no patched wearables)", () => {
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

      const canonical = gotchi.withSetsNumericTraits ?? gotchi.modifiedNumericTraits;
      // When subgraph data is provided and no patched wearables, use subgraph values
      expect(withCanonical.finalTraits).toEqual(canonical);
    }
  });

  it("local computation matches the subgraph exactly (no patched wearables, unchanged outfit)", () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const file of fixtures) {
      const raw = readFileSync(join(fixturesDir, file), "utf8");
      const gotchi = JSON.parse(raw) as FixtureGotchi;

      const fallbackOnly = computeBRSBreakdown({
        baseTraits: gotchi.numericTraits,
        equippedWearables: gotchi.equippedWearables,
        wearablesById,
      });

      const hasPatchedWearable = gotchi.equippedWearables.some(
        (id) => id && PATCHED_WEARABLE_IDS.has(id)
      );
      if (hasPatchedWearable) {
        // Local uses corrected wearable data, so it intentionally diverges
        // from the subgraph — only sanity-check the shape here.
        expect(fallbackOnly.finalTraits).toHaveLength(6);
        fallbackOnly.finalTraits.forEach((v) => expect(Number.isFinite(v)).toBe(true));
        continue;
      }

      // Fixtures snapshot subgraph values for their own outfit, so with no
      // patched wearables the local pipeline must reproduce them exactly.
      const canonical = gotchi.withSetsNumericTraits ?? gotchi.modifiedNumericTraits;
      expect(fallbackOnly.finalTraits, file).toEqual(canonical);
    }
  });

  it("Super Aagent superset outfit pins the official single-set BRS", () => {
    // Full Super Aagent outfit (data/wearableSets.json): ids [55,56,57,58,59].
    // It also matches the Aagent subset [55,56,57,58]; only the best set
    // (Super Aagent) may count.
    const raw = readFileSync(join(fixturesDir, "superset_super_aagent.json"), "utf8");
    const gotchi = JSON.parse(raw) as FixtureGotchi;

    const breakdown = computeBRSBreakdown({
      baseTraits: gotchi.numericTraits,
      equippedWearables: gotchi.equippedWearables,
      wearablesById,
    });

    // Arithmetic (all from data/wearables.json + data/wearableSets.json):
    //   base traits            [50, 50, 50, 50, 10, 20]
    //   wearable trait mods     NRG 0-1-1+0-2 = -4 | AGG 1+1+0+3+0 = +5
    //                           SPK 1+1+2+0+1 = +5 | BRN 1+0+0+0+0 = +1
    //   Super Aagent set mods   NRG -1, SPK +2 (Aagent's -1/+1 must NOT stack)
    //   final traits           [45, 55, 57, 51, 10, 20]
    //   trait BRS               55+56+58+52+90+80 = 391
    //   wearable flat           5 items x rarityScoreModifier 5 = 25
    //   set flat                Super Aagent only = 4 (not 4 + 3)
    //   total                   391 + 25 + 4 = 420
    expect(breakdown.bestSet?.name).toBe("Super Aagent");
    expect(breakdown.finalTraits).toEqual([45, 55, 57, 51, 10, 20]);
    expect(breakdown.wearableFlat).toBe(25);
    expect(breakdown.setFlatBrs).toBe(4);
    expect(breakdown.totalBrs).toBe(420);
  });
});

