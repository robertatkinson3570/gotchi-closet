// server/steward/encode.test.ts
import { describe, it, expect } from "vitest";
import { toFunctionSelector } from "viem";
import { workPlanToCalls } from "./encode";
import { AAVEGOTCHI_DIAMOND, REALM_DIAMOND, PET_ABI, REALM_ABI } from "./abi";

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

// SAFETY INVARIANT (Hermes autonomous go-live, runbook §4): the autonomous path may ONLY ever
// build pet/channel/claim calls. This guard fails if any future edit teaches the encoder a
// funds-moving call — the code-layer half of "the session key can't call non-allowlisted selectors".
describe("safety invariant — every emitted selector is pet/channel/claim, never funds-moving", () => {
  const ALLOWED = new Set(
    [
      toFunctionSelector(PET_ABI[0]),   // interact (pet)
      toFunctionSelector(REALM_ABI[0]), // channelAlchemica
      toFunctionSelector(REALM_ABI[1]), // claimAllAvailableAlchemica
    ].map((s) => s.toLowerCase())
  );
  // ERC-20/721 value-moving selectors the autonomous key must never be able to call.
  const FORBIDDEN = new Set([
    "0xa9059cbb", // transfer(address,uint256)
    "0x23b872dd", // transferFrom(address,address,uint256)
    "0x095ea7b3", // approve(address,uint256)
    "0xa22cb465", // setApprovalForAll(address,bool)
    "0x42842e0e", // safeTransferFrom(address,address,uint256)
  ]);

  it("a full pet+channel+claim plan emits only allowlisted, non-funds-moving selectors", () => {
    const calls = workPlanToCalls({
      pet: [1, 2],
      channel: [{ parcelId: 10, gotchiId: 3, lastChanneled: 0 }],
      claim: [10],
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      const selector = c.data.slice(0, 10).toLowerCase();
      expect(ALLOWED.has(selector)).toBe(true);
      expect(FORBIDDEN.has(selector)).toBe(false);
    }
  });
});
