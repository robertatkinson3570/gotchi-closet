import { describe, expect, it } from "vitest";
import {
  totalSpiritPoints,
  computeWearableDelta,
  computeSimTraits,
} from "./respec";

describe("totalSpiritPoints", () => {
  it("uses usedSkillPoints as refundable pool", () => {
    expect(totalSpiritPoints(0)).toBe(0);
    expect(totalSpiritPoints(1)).toBe(1);
    expect(totalSpiritPoints(3)).toBe(3);
    expect(totalSpiritPoints(19)).toBe(19);
  });
});

describe("computeWearableDelta", () => {
  it("computes modified - base for first 4 traits", () => {
    const base = [10, 20, 30, 40, 50, 60];
    const modified = [12, 18, 35, 37, 50, 60];
    expect(computeWearableDelta(base, modified)).toEqual([2, -2, 5, -3]);
  });
});

describe("computeSimTraits", () => {
  it("applies allocations to base traits only when no wearables", () => {
    const result = computeSimTraits({
      baseTraits: [10, 10, 10, 10, 0, 0],
      allocated: [1, 2, 0, 1],
    });
    expect(result.simBase).toEqual([11, 12, 10, 11]);
    expect(result.simModified).toEqual([11, 12, 10, 11]);
  });

  it("applies wearable and set deltas to simModified", () => {
    const result = computeSimTraits({
      baseTraits: [50, 50, 50, 50, 0, 0],
      allocated: [5, -3, 2, 0],
      wearableDelta: [2, 1, -1, 3],
      setDelta: [1, 1, 1, 1],
    });
    expect(result.simBase).toEqual([55, 47, 52, 50]);
    expect(result.simModified).toEqual([58, 49, 52, 54]);
  });

  it("returns arrays with 4 finite numbers", () => {
    const result = computeSimTraits({
      baseTraits: [undefined as any, NaN, null as any, "foo" as any, 0, 0],
      allocated: [1, 2, 3, 4],
      wearableDelta: [NaN, undefined as any, 1, 2],
      setDelta: [null as any, 1, undefined as any, 3],
    });
    expect(result.simBase).toEqual([1, 2, 3, 4]);
    expect(result.simModified).toHaveLength(4);
    result.simBase.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    result.simModified.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  it("uses respecBaseTraits when provided", () => {
    const result = computeSimTraits({
      baseTraits: [100, 100, 100, 100, 0, 0],
      respecBaseTraits: [30, 30, 30, 30, 0, 0],
      allocated: [5, 5, 5, 5],
    });
    expect(result.simBase).toEqual([35, 35, 35, 35]);
    expect(result.usingFallback).toBe(false);
  });

  it("falls back to baseTraits when respecBaseTraits missing", () => {
    const result = computeSimTraits({
      baseTraits: [40, 40, 40, 40, 0, 0],
      allocated: [0, 0, 0, 0],
    });
    expect(result.simBase).toEqual([40, 40, 40, 40]);
    expect(result.usingFallback).toBe(true);
  });
});

