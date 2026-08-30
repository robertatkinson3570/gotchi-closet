import { describe, it, expect } from "vitest";
import { parseLlamaGhst, usdToGhstWeiAt } from "./ghstUsd";

/** GHST at the LIVE rate or no quote at all. */
describe("ghstUsd", () => {
  it("parses DeFiLlama's payload and refuses a missing or stale price", () => {
    const nowS = 1_800_000_000;
    expect(parseLlamaGhst({ coins: { "base:0xcd2f": { price: 0.4, timestamp: nowS - 60 } } }, nowS)).toBe(0.4);
    expect(() => parseLlamaGhst({ coins: {} }, nowS)).toThrow(/not live/);
    expect(() => parseLlamaGhst({ coins: { "base:0xcd2f": { price: 0.4, timestamp: nowS - 7 * 3600 } } }, nowS)).toThrow(/stale/);
    expect(() => parseLlamaGhst({ coins: { "base:0xcd2f": { price: 0 } } }, nowS)).toThrow(/not live/);
  });
  it("converts USD to GHST wei rounded up at the 6th decimal", () => {
    expect(usdToGhstWeiAt(9, 0.4).toString()).toBe("22500000000000000000");
    expect(usdToGhstWeiAt(29, 0.3).toString()).toBe("96666667000000000000");
    expect(() => usdToGhstWeiAt(9, 0)).toThrow(/not live/);
  });
});
