import { describe, expect, it } from "vitest";
import { isSaveEligible } from "./SaveOutfitButton";

// Dirty baseline: slot 0 differs from chain — eligible when all gates pass.
const base = () => ({
  isConnected: true,
  onBase: true,
  connectedOwned: true,
  locked: false,
  desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
  currentSlots: [0, 0, 0, 0, 0, 0, 0, 0],
  hasRespecTarget: false,
});

describe("isSaveEligible (save gating)", () => {
  it("dirty outfit + all gates pass → eligible", () => {
    expect(isSaveEligible(base())).toBe(true);
  });

  it("disconnected wallet → not eligible", () => {
    expect(isSaveEligible({ ...base(), isConnected: false })).toBe(false);
  });

  it("wrong chain → not eligible", () => {
    expect(isSaveEligible({ ...base(), onBase: false })).toBe(false);
  });

  it("not owned by the connected wallet (watch-only) → not eligible", () => {
    expect(isSaveEligible({ ...base(), connectedOwned: false })).toBe(false);
  });

  it("lending-locked gotchi → not eligible", () => {
    expect(isSaveEligible({ ...base(), locked: true })).toBe(false);
  });

  it("clean outfit + no respec → not eligible (nothing to save)", () => {
    expect(
      isSaveEligible({ ...base(), desiredSlots: [0, 0, 0, 0, 0, 0, 0, 0] })
    ).toBe(false);
  });

  it("respec-only (clean outfit) → eligible", () => {
    expect(
      isSaveEligible({
        ...base(),
        desiredSlots: [0, 0, 0, 0, 0, 0, 0, 0],
        hasRespecTarget: true,
      })
    ).toBe(true);
  });

  it("same ids in different slots (slot-order change) → eligible", () => {
    expect(
      isSaveEligible({
        ...base(),
        desiredSlots: [0, 7, 0, 0, 0, 0, 0, 0],
        currentSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      })
    ).toBe(true);
  });

  it("null/undefined slot entries normalize to 0 (no false dirty)", () => {
    expect(
      isSaveEligible({
        ...base(),
        desiredSlots: [0, 0, 0, 0, 0, 0, 0, 0],
        currentSlots: [undefined, null, 0, 0, 0, 0, 0, 0] as unknown as number[],
      })
    ).toBe(false);
  });
});
