// server/steward/dueWork.test.ts
import { describe, it, expect } from "vitest";
import { computeWork, isEmpty, PET_COOLDOWN_SEC, RESERVOIR_COOLDOWN_SEC, CLAIM_DUST_MIN } from "./dueWork";

const NOW = 1_000_000_000;
const dust = CLAIM_DUST_MIN;
const big = dust * 5n;

function snap() {
  return {
    gotchis: [
      { id: 1, lastInteracted: NOW - PET_COOLDOWN_SEC - 1, lastChanneled: 0 },          // pet due, channel-ready
      { id: 2, lastInteracted: NOW - 60, lastChanneled: NOW - 60 },                      // pet NOT due, channel on cd
    ],
    parcels: [
      { id: 10, altarLevel: 9, lastChanneled: 0, lastClaimed: NOW - RESERVOIR_COOLDOWN_SEC - 1, claimable: [big, 0n, 0n, 0n] },
      { id: 11, altarLevel: 0, lastChanneled: 0, lastClaimed: 0, claimable: [0n, 0n, 0n, 0n] }, // no altar, empty
    ],
  };
}

describe("computeWork", () => {
  it("pets only gotchis past the 12h cooldown", () => {
    const w = computeWork({ pet: true, channel: false, claim: false }, snap(), NOW);
    expect(w.pet).toEqual([1]);
    expect(w.channel).toEqual([]);
    expect(w.claim).toEqual([]);
  });

  it("claims only parcels off-cooldown with above-dust balance", () => {
    const w = computeWork({ pet: false, channel: false, claim: true }, snap(), NOW);
    expect(w.claim).toEqual([10]); // 11 has no balance
  });

  it("skips claim when balance is below dust", () => {
    const s = snap();
    s.parcels[0].claimable = [dust - 1n, 0n, 0n, 0n];
    const w = computeWork({ pet: false, channel: false, claim: true }, s, NOW);
    expect(w.claim).toEqual([]);
  });

  it("assigns an off-cooldown gotchi to each altared parcel, highest altar first, one gotchi per run", () => {
    const w = computeWork({ pet: false, channel: true, claim: false }, snap(), NOW);
    // only parcel 10 has an altar; only gotchi 1 is off channel-cooldown
    expect(w.channel).toEqual([{ parcelId: 10, gotchiId: 1, lastChanneled: 0 }]);
  });

  it("disabled chores produce empty arrays", () => {
    const w = computeWork({ pet: false, channel: false, claim: false }, snap(), NOW);
    expect(isEmpty(w)).toBe(true);
  });

  it("isEmpty is false when any work exists", () => {
    expect(isEmpty(computeWork({ pet: true, channel: false, claim: false }, snap(), NOW))).toBe(false);
  });
});
