import { describe, expect, it } from "vitest";
import {
  totalSpiritPoints,
  computeSimTraits,
  editableBrsCorrection,
} from "./respec";

describe("respec pool (audit H2)", () => {
  it("pool = usedSkillPoints + availableSkillPoints (post-reset refund + unspent)", () => {
    expect(totalSpiritPoints(5, 3)).toBe(8);
    expect(totalSpiritPoints(5, undefined)).toBe(5); // chain read pending → conservative
    expect(totalSpiritPoints(undefined, 3)).toBe(3);
    expect(totalSpiritPoints(-1, -1)).toBe(0);
  });
});

describe("respec BRS correction (audit H3)", () => {
  it("is 0 for a point spent 49→50 (boundary)", () => {
    expect(editableBrsCorrection([49, 10, 10, 10], [50, 10, 10, 10])).toBe(0);
  });
  it("is -1 for a point spent toward 50", () => {
    expect(editableBrsCorrection([10, 10, 10, 10], [11, 10, 10, 10])).toBe(-1);
  });
  it("is +1 for a point away from 50", () => {
    expect(editableBrsCorrection([10, 10, 10, 10], [9, 10, 10, 10])).toBe(1);
  });

  it("base and modified corrections differ across the 50 fold (I-1)", () => {
    // Respec base 48→52 with a +10 wearable equipped: in base space the
    // correction is +1 (BRS 52→53), but the displayed MODIFIED traits move
    // 58→62, a +4 correction (BRS 59→63). Scores shown in modified space
    // (traitWithMods/totalBrs) must use the modified-space correction —
    // applying the base-space one understates the change.
    const currentBase = [48, 10, 10, 10];
    const targetBase = [52, 10, 10, 10];
    const currentModified = [58, 10, 10, 10]; // +10 wearable
    const targetModified = [62, 10, 10, 10];
    expect(editableBrsCorrection(currentBase, targetBase)).toBe(1);
    expect(editableBrsCorrection(currentModified, targetModified)).toBe(4);
  });
});

describe("birth baseline integrity (audit M1 + eye slice)", () => {
  it("simBase preserves eye traits from a 6-length baseline", () => {
    const { simBase } = computeSimTraits({
      baseTraits: [1, 2, 3, 4, 90, 80],
      respecBaseTraits: [5, 6, 7, 8, 90, 80],
      allocated: [1, 0, 0, 0],
    });
    expect(simBase[4]).toBe(90);
    expect(simBase[5]).toBe(80);
    expect(simBase.slice(0, 4)).toEqual([6, 6, 7, 8]);
  });

  it("preserves eye traits with a larger multi-trait allocation", () => {
    const { simBase } = computeSimTraits({
      baseTraits: [1, 2, 3, 4, 90, 80],
      respecBaseTraits: [10, 20, 30, 40, 90, 80],
      allocated: [3, 2, 0, 5],
    });
    expect(simBase).toEqual([13, 22, 30, 45, 90, 80]);
  });
});

describe("computeSimTraits", () => {
  it("applies allocations to base traits only when no wearables", () => {
    const result = computeSimTraits({
      baseTraits: [10, 10, 10, 10, 0, 0],
      allocated: [1, 2, 0, 1],
    });
    expect(result.simBase.slice(0, 4)).toEqual([11, 12, 10, 11]);
    expect(result.simModified.slice(0, 4)).toEqual([11, 12, 10, 11]);
  });

  it("applies wearable and set deltas to simModified", () => {
    const result = computeSimTraits({
      baseTraits: [50, 50, 50, 50, 0, 0],
      allocated: [5, -3, 2, 0],
      wearableDelta: [2, 1, -1, 3],
      setDelta: [1, 1, 1, 1],
    });
    expect(result.simBase.slice(0, 4)).toEqual([55, 47, 52, 50]);
    expect(result.simModified.slice(0, 4)).toEqual([58, 49, 52, 54]);
  });

  it("returns arrays with 6 finite numbers", () => {
    const result = computeSimTraits({
      baseTraits: [undefined as any, NaN, null as any, "foo" as any, 0, 0],
      allocated: [1, 2, 3, 4],
      wearableDelta: [NaN, undefined as any, 1, 2],
      setDelta: [null as any, 1, undefined as any, 3],
    });
    expect(result.simBase.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(result.simModified).toHaveLength(6);
    result.simBase.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    result.simModified.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  it("uses respecBaseTraits when provided", () => {
    const result = computeSimTraits({
      baseTraits: [100, 100, 100, 100, 0, 0],
      respecBaseTraits: [30, 30, 30, 30, 0, 0],
      allocated: [5, 5, 5, 5],
    });
    expect(result.simBase.slice(0, 4)).toEqual([35, 35, 35, 35]);
    expect(result.usingFallback).toBe(false);
  });

  it("falls back to baseTraits when respecBaseTraits missing", () => {
    const result = computeSimTraits({
      baseTraits: [40, 40, 40, 40, 0, 0],
      allocated: [0, 0, 0, 0],
    });
    expect(result.simBase.slice(0, 4)).toEqual([40, 40, 40, 40]);
    expect(result.usingFallback).toBe(true);
  });
});

