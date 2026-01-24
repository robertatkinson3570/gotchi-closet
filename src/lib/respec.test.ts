import { describe, expect, it } from "vitest";
import {
  totalSpiritPoints,
  computeWearableDelta,
  computeSimTraits,
} from "./respec";

describe("totalSpiritPoints", () => {
  it("computes floor(level/3)", () => {
    expect(totalSpiritPoints(0)).toBe(0);
    expect(totalSpiritPoints(1)).toBe(0);
    expect(totalSpiritPoints(3)).toBe(1);
    expect(totalSpiritPoints(9)).toBe(3);
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
  it("applies allocations to base and wearable delta to modified", () => {
    const result = computeSimTraits({
      baseTraits: [10, 10, 10, 10, 0, 0],
      wearableDelta: [2, 0, -1, 3],
      allocated: [1, 2, 0, 1],
    });
    expect(result.simBase).toEqual([11, 12, 10, 11]);
    expect(result.simModified).toEqual([13, 12, 9, 14]);
  });
});

