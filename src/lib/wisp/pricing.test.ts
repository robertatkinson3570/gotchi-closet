import { describe, it, expect } from "vitest";
import { annualSavingUsd, defaultMonths, isValidPurchase, monthsOnPlanSwitch, PERIODS, periodChipLabel, priceUsd, PLAN_LIMITS, WISP_PLANS } from "./pricing";
// A verbatim copy of GVR's packages/shared/src/wispPriceTable.json (GVR cf42229). GVR quotes GHST
// from its own copy of priceUsd, and POST /api/mcp/buy only accepts a payment within SLIPPAGE_BPS
// of Closet's price, so every cell here must match or a GVR-quoted Holder payment is refused.
import priceTable from "../../../tests/fixtures/wispPriceTable.json";

type Cell = { plan: "holder" | "pro" | "studio"; months: number; ghosts: number; usd: number };

/** The catalogue with the Holder SKU (GVR's holder tier, 2026-08-30) and the annual Holder price. */
describe("wisp pricing", () => {
  it("keeps Pro/Studio and adds Holder $9 + $3 per extra ghost (capped at 4), the same period discounts", () => {
    expect(priceUsd("pro", 1)).toBe(29);
    expect(priceUsd("pro", 12)).toBe(278);
    expect(priceUsd("studio", 3)).toBe(537);
    expect(priceUsd("holder", 1)).toBe(9);
    expect(priceUsd("holder", 1, 2)).toBe(15);
    expect(priceUsd("holder", 12, 1)).toBe(98);
    expect(priceUsd("holder", 1, 99)).toBe(21);
    expect(priceUsd("pro", 1, 5)).toBe(29);
    expect(isValidPurchase("holder", 3)).toBe(true);
    expect(isValidPurchase("holder", 2)).toBe(false);
    expect(WISP_PLANS.holder.usdPerMonth).toBe(9);
    expect(PLAN_LIMITS.holder.stateful).toBe(true);
  });

  it("prices the annual Holder at $69 for 12 months with no extra ghosts", () => {
    expect(WISP_PLANS.holder.annualUsd).toBe(69);
    expect(priceUsd("holder", 12, 0)).toBe(69);
  });

  it("matches GVR's annual-live price table in every (plan, months, ghosts) cell", () => {
    const cells = (priceTable as { annual: Cell[] }).annual;
    expect(cells).toHaveLength(54);
    const mismatches = cells
      .map((c) => ({ ...c, closet: priceUsd(c.plan, c.months, c.ghosts) }))
      .filter((c) => c.closet !== c.usd);
    expect(mismatches).toEqual([]);
  });

  it("THE YEARLY PUSH: the saving is derived, 39 for Holder and undefined for Pro/Studio", () => {
    expect(annualSavingUsd("holder")).toBe(39);
    expect(annualSavingUsd("holder")).toBe(priceUsd("holder", 1) * 12 - priceUsd("holder", 12));
    expect(annualSavingUsd("pro")).toBeUndefined();
    expect(annualSavingUsd("studio")).toBeUndefined();
  });

  it("the dialog opens Holder on 12 months and Pro/Studio on 1; a plan switch keeps a period picked by hand", () => {
    expect(defaultMonths("holder")).toBe(12);
    expect(defaultMonths("pro")).toBe(1);
    expect(defaultMonths("studio")).toBe(1);
    expect(monthsOnPlanSwitch("holder", 1, false)).toBe(12);
    expect(monthsOnPlanSwitch("pro", 12, false)).toBe(1);
    expect(monthsOnPlanSwitch("holder", 3, true)).toBe(3);
    expect(monthsOnPlanSwitch("studio", 12, true)).toBe(12);
  });

  it("the 12-month chip names the annual price as the best value on Holder only", () => {
    const year = PERIODS.find((p) => p.months === 12)!;
    expect(periodChipLabel(year, "holder")).toBe("12 months ($69, best value)");
    expect(periodChipLabel(year, "pro")).toBe("12 months (−20%)");
    expect(periodChipLabel(PERIODS[1]!, "holder")).toBe("3 months (−10%)");
  });

  it("promises no Holder trial (none exists)", () => {
    for (const f of WISP_PLANS.holder.features) expect(f).not.toMatch(/trial|free to start|\b14 days\b/i);
  });
});
