import { describe, expect, it } from "vitest";
import { creditPackForGhst, expectedWeiForPack, CREDIT_PACKS } from "./pricing";

describe("companion credit pack pricing", () => {
  it("500 GHST pack gives 5000 credits", () => {
    expect(creditPackForGhst(500)?.credits).toBe(5000);
  });

  it("1000 GHST pack gives 12000 credits", () => {
    expect(creditPackForGhst(1000)?.credits).toBe(12000);
  });

  it("expectedWeiForPack(500) equals 500 * 10^18", () => {
    expect(expectedWeiForPack(500)).toBe(500n * 10n ** 18n);
  });

  it("expectedWeiForPack(1000) equals 1000 * 10^18", () => {
    expect(expectedWeiForPack(1000)).toBe(1000n * 10n ** 18n);
  });

  it("unknown GHST amount returns null", () => {
    expect(creditPackForGhst(7)).toBeNull();
    expect(expectedWeiForPack(7)).toBeNull();
  });

  it("exposes at least one credit pack", () => {
    expect(CREDIT_PACKS.length).toBeGreaterThan(0);
  });
});
