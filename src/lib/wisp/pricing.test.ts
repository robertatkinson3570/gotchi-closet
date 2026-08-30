import { describe, it, expect } from "vitest";
import { isValidPurchase, priceUsd, PLAN_LIMITS, WISP_PLANS } from "./pricing";

/** The catalogue with the Holder SKU (GVR's holder tier, 2026-08-30). */
describe("wisp pricing", () => {
  it("keeps Pro/Studio and adds Holder $9 + $3 per extra ghost (capped at 4), the same period discounts", () => {
    expect(priceUsd("pro", 1)).toBe(29);
    expect(priceUsd("pro", 12)).toBe(278);
    expect(priceUsd("studio", 3)).toBe(537);
    expect(priceUsd("holder", 1)).toBe(9);
    expect(priceUsd("holder", 1, 2)).toBe(15);
    expect(priceUsd("holder", 12, 1)).toBe(115);
    expect(priceUsd("holder", 1, 99)).toBe(21);
    expect(priceUsd("pro", 1, 5)).toBe(29);
    expect(isValidPurchase("holder", 3)).toBe(true);
    expect(isValidPurchase("holder", 2)).toBe(false);
    expect(WISP_PLANS.holder.usdPerMonth).toBe(9);
    expect(PLAN_LIMITS.holder.stateful).toBe(true);
  });
});
