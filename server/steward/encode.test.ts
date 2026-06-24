// server/steward/encode.test.ts
import { describe, it, expect } from "vitest";
import { workPlanToCalls } from "./encode";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND } from "./abi";

describe("workPlanToCalls", () => {
  it("emits one interact call to the aavegotchi diamond when pets are due", () => {
    const calls = workPlanToCalls({ pet: [1, 2], channel: [], claim: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].to.toLowerCase()).toBe(AAVEGOTCHI_DIAMOND.toLowerCase());
    expect(calls[0].data.startsWith("0x")).toBe(true);
  });

  it("emits one claimAll call to the realm diamond for all ready parcels", () => {
    const calls = workPlanToCalls({ pet: [], channel: [], claim: [10, 11] }, { claimerGotchiId: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0].to.toLowerCase()).toBe(REALM_DIAMOND.toLowerCase());
  });

  it("emits one channel call per assignment", () => {
    const calls = workPlanToCalls({
      pet: [], claim: [],
      channel: [
        { parcelId: 10, gotchiId: 1, lastChanneled: 0 },
        { parcelId: 12, gotchiId: 2, lastChanneled: 5 },
      ],
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.to.toLowerCase() === REALM_DIAMOND.toLowerCase())).toBe(true);
  });

  it("uses the first channel assignment's gotchi as the claimer when claiming and channeling together", () => {
    const calls = workPlanToCalls({ pet: [], claim: [10], channel: [{ parcelId: 10, gotchiId: 3, lastChanneled: 0 }] });
    expect(calls).toHaveLength(2); // 1 channel + 1 claim
  });

  it("throws if a claim has no claimer gotchi available", () => {
    expect(() => workPlanToCalls({ pet: [], channel: [], claim: [10] })).toThrowError(/claimer/);
  });

  it("returns no calls for an empty plan", () => {
    expect(workPlanToCalls({ pet: [], channel: [], claim: [] })).toEqual([]);
  });
});
