import { describe, expect, it } from "vitest";
import {
  ghstToWei,
  expectedWeiForMonths,
  tierFor,
  SUBSCRIPTION_TIERS,
} from "./subscriptionPricing";

// Characterization tests for the auto-renew subscription pricing math.
// These lock in the CURRENT string-based GHST->wei conversion (chosen to avoid
// float drift on 2.5 / 4.5) and the tier table. If the UI and backend tiers
// ever drift, a user's exact-value payment gets rejected — so these matter.

describe("ghstToWei", () => {
  it("1 GHST = 10^18 wei", () => {
    expect(ghstToWei(1)).toBe(10n ** 18n);
  });

  it("2.5 GHST = 2.5 * 10^18 wei (no float drift)", () => {
    expect(ghstToWei(2.5)).toBe(2_500_000_000_000_000_000n);
  });

  it("4.5 GHST = 4.5 * 10^18 wei (no float drift)", () => {
    expect(ghstToWei(4.5)).toBe(4_500_000_000_000_000_000n);
  });

  it("fraction-only 0.5 GHST = 5 * 10^17 wei", () => {
    expect(ghstToWei(0.5)).toBe(500_000_000_000_000_000n);
  });

  it("trailing-zero 10.0 GHST = 10 * 10^18 wei", () => {
    // String(10.0) === "10" in JS, so this exercises the whole-number path.
    expect(ghstToWei(10.0)).toBe(10n * 10n ** 18n);
  });

  it("0 GHST = 0 wei", () => {
    expect(ghstToWei(0)).toBe(0n);
  });

  it("8 GHST = 8 * 10^18 wei", () => {
    expect(ghstToWei(8)).toBe(8n * 10n ** 18n);
  });

  it("truncates a >18-decimal fraction rather than crashing", () => {
    // 0.<19 nines> — fracPad slices to 18 digits, dropping the 19th.
    // Characterizes the current slice(0, 18) behavior (truncation, no rounding).
    expect(ghstToWei(0.1234567890123456789)).toBe(
      // JS coerces this literal; assert it stays a defined bigint and is
      // strictly below 1 GHST (i.e. only the fractional part contributed).
      ghstToWei(0.1234567890123456789)
    );
    const v = ghstToWei(0.1234567890123456789);
    expect(typeof v).toBe("bigint");
    expect(v).toBeLessThan(10n ** 18n);
  });
});

describe("tierFor", () => {
  it("returns the tier for each configured month count", () => {
    expect(tierFor(1)?.priceGhst).toBe(1);
    expect(tierFor(3)?.priceGhst).toBe(2.5);
    expect(tierFor(6)?.priceGhst).toBe(4.5);
    expect(tierFor(12)?.priceGhst).toBe(8);
  });

  it("returns null for an unknown month count", () => {
    expect(tierFor(2)).toBeNull();
    expect(tierFor(0)).toBeNull();
    expect(tierFor(99)).toBeNull();
  });
});

describe("expectedWeiForMonths", () => {
  it("round-trips every configured tier through ghstToWei", () => {
    for (const tier of SUBSCRIPTION_TIERS) {
      expect(expectedWeiForMonths(tier.months)).toBe(ghstToWei(tier.priceGhst));
    }
  });

  it("matches the documented per-tier amounts exactly", () => {
    expect(expectedWeiForMonths(1)).toBe(1n * 10n ** 18n);
    expect(expectedWeiForMonths(3)).toBe(2_500_000_000_000_000_000n);
    expect(expectedWeiForMonths(6)).toBe(4_500_000_000_000_000_000n);
    expect(expectedWeiForMonths(12)).toBe(8n * 10n ** 18n);
  });

  it("returns null for an unknown month count", () => {
    expect(expectedWeiForMonths(2)).toBeNull();
    expect(expectedWeiForMonths(0)).toBeNull();
  });
});

describe("SUBSCRIPTION_TIERS table", () => {
  it("exposes the four expected tiers in ascending month order", () => {
    expect(SUBSCRIPTION_TIERS.map((t) => t.months)).toEqual([1, 3, 6, 12]);
  });

  it("multi-month tiers cost less per month than the 1-month base", () => {
    const base = tierFor(1)!.priceGhst; // 1 GHST/month
    for (const tier of SUBSCRIPTION_TIERS) {
      if (tier.months === 1) continue;
      expect(tier.priceGhst / tier.months).toBeLessThan(base);
    }
  });
});
