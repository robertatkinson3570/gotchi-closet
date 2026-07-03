import { describe, expect, it } from "vitest";
import { respecDeltaAffordable } from "./autoDressEngine";

// C-1: the trait-shape respec enumeration must never propose an allocation the
// chain can't afford (Σ|delta| vs the current base must fit the skill-point pool).
describe("respecDeltaAffordable", () => {
  it("accepts deltas whose L1 cost fits the pool", () => {
    expect(respecDeltaAffordable([1, -1, 0, 0], 2)).toBe(true);
    expect(respecDeltaAffordable([3, -3, 0, 0], 6)).toBe(true); // exact pool
    expect(respecDeltaAffordable([0, 0, 0, 0], 0)).toBe(true);
  });

  it("rejects deltas that exceed the pool", () => {
    expect(respecDeltaAffordable([1, -1, 0, 0], 1)).toBe(false);
    expect(respecDeltaAffordable([3, -3, 2, -2], 6)).toBe(false);
    expect(respecDeltaAffordable([1, -1, 0, 0], 0)).toBe(false);
  });

  it("treats a missing/invalid pool as zero (conservative)", () => {
    expect(respecDeltaAffordable([1, -1, 0, 0], Number.NaN)).toBe(false);
    expect(respecDeltaAffordable([0, 0, 0, 0], Number.NaN)).toBe(true);
  });
});
