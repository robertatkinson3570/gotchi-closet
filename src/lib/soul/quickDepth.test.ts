import { describe, it, expect } from "vitest";
import { quickSoulDepth, KINSHIP_CAP, XP_CAP, SOUL_AGE_FULL_DAYS } from "./quickDepth";

describe("quickSoulDepth", () => {
  it("zero kinship, zero level, no age → Flickering", () => {
    const result = quickSoulDepth(0, 0);
    expect(result.score).toBe(0);
    expect(result.level).toBe("Flickering");
  });

  it("higher kinship → higher score", () => {
    const low = quickSoulDepth(100, 0);
    const high = quickSoulDepth(500, 0);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("higher level → higher score (via XP proxy)", () => {
    const low = quickSoulDepth(0, 5);
    const high = quickSoulDepth(0, 20);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("older createdAt → higher soulAge contribution", () => {
    const nowSeconds = Date.now() / 1000;
    const recentSeconds = nowSeconds - 10 * 86_400;   // 10 days ago
    const oldSeconds    = nowSeconds - 200 * 86_400;  // 200 days ago

    const recent = quickSoulDepth(0, 0, recentSeconds);
    const old    = quickSoulDepth(0, 0, oldSeconds);
    expect(old.score).toBeGreaterThan(recent.score);
  });

  it("score is capped at 60 (only 2 of 4 signals available)", () => {
    // Max kinship + max level + very old gotchi
    const nowSeconds = Date.now() / 1000;
    const veryOld = nowSeconds - SOUL_AGE_FULL_DAYS * 2 * 86_400;
    const result = quickSoulDepth(KINSHIP_CAP, XP_CAP / 1000, veryOld);
    // kinshipXp = 35, soulAge = 25 → 60
    expect(result.score).toBeCloseTo(60, 1);
    expect(result.score).toBeLessThanOrEqual(60);
  });

  it("level thresholds map correctly", () => {
    const nowSeconds = Date.now() / 1000;
    // Saturated kinshipXp=35, saturated soulAge=25 → score≈60 → Bonded (≥55)
    const veryOld = nowSeconds - SOUL_AGE_FULL_DAYS * 2 * 86_400;
    const maxResult = quickSoulDepth(KINSHIP_CAP, XP_CAP / 1000, veryOld);
    expect(maxResult.level).toBe("Bonded");

    // Low kinship, no age → score≈0 → Flickering
    const flicker = quickSoulDepth(0, 0);
    expect(flicker.level).toBe("Flickering");

    // Midpoint kinship (no age) → ~17.5 pts → Stirring (≥15)
    const mid = quickSoulDepth(KINSHIP_CAP, 0);
    expect(mid.level).toBe("Stirring");
  });

  it("no createdAt → soulAge contribution is 0", () => {
    const withoutAge = quickSoulDepth(500, 0);
    // Manually compute expected kinshipXp contribution only
    const withAge = quickSoulDepth(500, 0, Date.now() / 1000 - 1); // 1 second ago ≈ 0 days
    expect(withoutAge.score).toBeCloseTo(withAge.score, 0);
  });

  it("future createdAt is clamped to 0 days", () => {
    const futureSeconds = Date.now() / 1000 + 10 * 86_400;
    const result = quickSoulDepth(0, 0, futureSeconds);
    expect(result.score).toBe(0);
    expect(result.level).toBe("Flickering");
  });
});
