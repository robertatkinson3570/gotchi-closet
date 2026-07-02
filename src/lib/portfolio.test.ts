import { describe, it, expect } from "vitest";
import { weiToGhst, portfolioFloorGhst } from "./portfolio";

describe("weiToGhst", () => {
  it("converts a wei string to GHST units", () => {
    expect(weiToGhst("1500000000000000000")).toBe(1.5);
  });
  it("converts a bigint", () => {
    expect(weiToGhst(2n * 10n ** 18n)).toBe(2);
  });
  it("returns 0 for null, undefined, garbage, and negatives", () => {
    expect(weiToGhst(null)).toBe(0);
    expect(weiToGhst(undefined)).toBe(0);
    expect(weiToGhst("abc")).toBe(0);
    expect(weiToGhst("-5")).toBe(0);
  });
});

describe("portfolioFloorGhst", () => {
  it("sums gotchis at floor plus GHST balance", () => {
    // 3 gotchis x 100 GHST floor + 50 GHST balance = 350
    expect(
      portfolioFloorGhst({
        gotchiCount: 3,
        gotchiFloorWei: "100000000000000000000",
        ghstWei: 50n * 10n ** 18n,
      })
    ).toBe(350);
  });
  it("is 0 with no holdings", () => {
    expect(portfolioFloorGhst({ gotchiCount: 0, gotchiFloorWei: null, ghstWei: 0n })).toBe(0);
  });
  it("counts only GHST when there is no active floor listing", () => {
    expect(
      portfolioFloorGhst({ gotchiCount: 5, gotchiFloorWei: null, ghstWei: 10n * 10n ** 18n })
    ).toBe(10);
  });
  it("treats a negative/NaN count as 0", () => {
    expect(
      portfolioFloorGhst({ gotchiCount: -2, gotchiFloorWei: "1000000000000000000", ghstWei: 0n })
    ).toBe(0);
  });
});
