import { describe, expect, it } from "vitest";
import { companionTierFor, expectedWeiForTier, COMPANION_TIERS } from "./pricing";

describe("companion pricing", () => {
  it("has a 30-day tier and prices it in wei (18 decimals)", () => {
    const t = companionTierFor(30);
    expect(t).not.toBeNull();
    expect(expectedWeiForTier(30)).toBe(BigInt(t!.priceGhst) * 10n ** 18n);
  });

  it("returns null for an unknown term", () => {
    expect(companionTierFor(7)).toBeNull();
    expect(expectedWeiForTier(7)).toBeNull();
  });

  it("exposes at least one tier", () => {
    expect(COMPANION_TIERS.length).toBeGreaterThan(0);
  });
});
