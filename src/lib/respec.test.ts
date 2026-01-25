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
  it("applies allocations to base traits only", () => {
    const result = computeSimTraits({
      baseTraits: [10, 10, 10, 10, 0, 0],
      allocated: [1, 2, 0, 1],
    });
    expect(result.simBase).toEqual([11, 12, 10, 11]);
    expect(result.simModified).toEqual([11, 12, 10, 11]);
  });
});

