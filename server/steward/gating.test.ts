import { describe, it, expect } from "vitest";
import { gasPriceTooHigh, floatCoversRun } from "./gating";

describe("gasPriceTooHigh", () => {
  it("returns false when current base fee is at or below the ceiling", () => {
    expect(gasPriceTooHigh(5n, 10n)).toBe(false);
    expect(gasPriceTooHigh(10n, 10n)).toBe(false);
  });
  it("returns true when current base fee exceeds the ceiling", () => {
    expect(gasPriceTooHigh(11n, 10n)).toBe(true);
  });
  it("treats a zero/absent ceiling as 'no ceiling' (never too high)", () => {
    expect(gasPriceTooHigh(999999n, 0n)).toBe(false);
  });
});

describe("floatCoversRun", () => {
  it("runs when the owner's float is at or above the worst-case cost", () => {
    expect(floatCoversRun(1000n, 1000n)).toBe(true);
    expect(floatCoversRun(2000n, 1000n)).toBe(true);
  });
  it("skips when the float is below the worst-case cost", () => {
    expect(floatCoversRun(999n, 1000n)).toBe(false);
  });
  it("skips when the worst-case cost is zero/unknown (cannot bound the spend)", () => {
    expect(floatCoversRun(1000n, 0n)).toBe(false);
  });
});
