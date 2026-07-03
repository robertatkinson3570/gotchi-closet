import { describe, expect, it } from "vitest";

import { planSave, type SavePlanInput } from "@/lib/savePlan";

const base = (over: Partial<SavePlanInput> = {}): SavePlanInput => ({
  targetGotchiId: "100",
  desiredSlots: [0, 0, 0, 0, 0, 0, 0, 0],
  currentSlots: [0, 0, 0, 0, 0, 0, 0, 0],
  walletBalances: {},
  ownedGotchis: [],
  respec: null,
  listingsByWearable: {},
  ...over,
});

describe("planSave (spec: save classifier)", () => {
  it("no changes + no respec → empty plan", () => {
    expect(planSave(base()).steps).toEqual([]);
  });

  it("wallet-held wearable → single equip step", () => {
    const p = planSave(base({ desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0], walletBalances: { 7: 1 } }));
    expect(p.steps).toEqual([
      { kind: "equip", gotchiId: "100", slots16: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(p.blocked).toEqual([]);
  });

  it("already equipped on target → no acquisition needed (slot move)", () => {
    const p = planSave(base({ desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0], currentSlots: [0, 7, 0, 0, 0, 0, 0, 0] }));
    expect(p.steps).toEqual([
      { kind: "equip", gotchiId: "100", slots16: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
  });

  it("steal: wearable on another owned gotchi → unequip there first, with warning", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [7, 3, 0, 0, 0, 0, 0, 0], locked: false }],
    }));
    expect(p.steps).toEqual([
      { kind: "unequip", gotchiId: "200", slots16: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], stolen: [7] },
      { kind: "equip", gotchiId: "100", slots16: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(p.warnings).toEqual([{ wearableId: 7, fromGotchiId: "200" }]);
  });

  it("locked (rented) source gotchis are not stealable → blocked when no listing", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [7, 0, 0, 0, 0, 0, 0, 0], locked: true }],
    }));
    expect(p.blocked).toEqual([{ wearableId: 7, reason: "unobtainable" }]);
    expect(p.steps).toEqual([]);
  });

  it("baazaar: not owned anywhere but listed → buy step before equip", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      listingsByWearable: { 7: { listingId: "555", priceInWei: "1000000000000000000" } },
    }));
    expect(p.steps[0]).toEqual({ kind: "buy", wearableId: 7, listingId: "555", priceInWei: "1000000000000000000", quantity: 1 });
    expect(p.steps[1].kind).toBe("equip");
    expect(p.totalBuyCostWei).toBe(1000000000000000000n);
  });

  it("duplicates: same id in both hands needs 2 sources (1 wallet + 1 steal)", () => {
    const p = planSave(base({
      desiredSlots: [0, 0, 0, 0, 9, 9, 0, 0],
      walletBalances: { 9: 1 },
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [0, 0, 0, 0, 9, 0, 0, 0], locked: false }],
    }));
    expect(p.steps.filter((s) => s.kind === "unequip")).toHaveLength(1);
    expect(p.warnings).toHaveLength(1);
  });

  it("respec present → reset + spend, values = target − birth", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      walletBalances: { 7: 1 },
      respec: { targetBase: [50, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 0, usedSkillPoints: 2, availableSkillPoints: 0 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["resetSkillPoints", "spendSkillPoints", "equip"]);
    const spend = p.steps.find((s) => s.kind === "spendSkillPoints") as any;
    expect(spend.values).toEqual([2, 0, 0, 0]);
  });

  it("respec with target === birth skips the spend step", () => {
    const p = planSave(base({
      respec: { targetBase: [48, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 1, usedSkillPoints: 3, availableSkillPoints: 0 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["resetSkillPoints"]);
  });

  // C-1: respec pool validation — the chain reverts spendSkillPoints when the
  // allocation exceeds refunded + unspent points, so the plan must block first
  // (otherwise reset succeeds, spend reverts, gotchi is stripped + fee burned).
  it("respec exceeding the pool → blocked plan with respec-pool reason, no steps", () => {
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      walletBalances: { 7: 1 },
      respec: { targetBase: [52, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 0, usedSkillPoints: 2, availableSkillPoints: 1 },
    }));
    expect(p.blocked).toEqual([{ reason: "respec-pool", needed: 4, available: 3 }]);
    expect(p.steps).toEqual([]);
  });

  it("respec with usedSkillPoints === 0 skips the reset step (nothing to refund)", () => {
    const p = planSave(base({
      respec: { targetBase: [50, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 0, usedSkillPoints: 0, availableSkillPoints: 5 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["spendSkillPoints"]);
    const spend = p.steps[0] as any;
    expect(spend.values).toEqual([2, 0, 0, 0]);
  });

  it("respec spending exactly the pool passes", () => {
    const p = planSave(base({
      respec: { targetBase: [52, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 0, usedSkillPoints: 2, availableSkillPoints: 2 },
    }));
    expect(p.blocked).toEqual([]);
    expect(p.steps.map((s) => s.kind)).toEqual(["resetSkillPoints", "spendSkillPoints"]);
  });

  it("duplicate ownedGotchis entries are deduped (single unequip, single warning)", () => {
    const source = { gotchiId: "200", equippedWearables: [7, 0, 0, 0, 0, 0, 0, 0], locked: false };
    const p = planSave(base({
      desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [source, { ...source, equippedWearables: [...source.equippedWearables] }],
    }));
    expect(p.steps.filter((s) => s.kind === "unequip")).toHaveLength(1);
    expect(p.warnings).toEqual([{ wearableId: 7, fromGotchiId: "200" }]);
  });

  it("respec with used=0 and zero allocation → no respec steps at all", () => {
    const p = planSave(base({
      respec: { targetBase: [48, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 0, usedSkillPoints: 0, availableSkillPoints: 5 },
    }));
    expect(p.steps).toEqual([]);
  });

  it("unobtainable wearable blocks the whole plan (no partial save)", () => {
    const p = planSave(base({ desiredSlots: [7, 0, 0, 0, 0, 0, 0, 0] }));
    expect(p.blocked).toEqual([{ wearableId: 7, reason: "unobtainable" }]);
    expect(p.steps).toEqual([]);
  });

  it("step order: buys → respec → unequips → final equip", () => {
    const p = planSave(base({
      desiredSlots: [7, 8, 0, 0, 0, 0, 0, 0],
      ownedGotchis: [{ gotchiId: "200", equippedWearables: [8, 0, 0, 0, 0, 0, 0, 0], locked: false }],
      listingsByWearable: { 7: { listingId: "555", priceInWei: "5" } },
      respec: { targetBase: [50, 40, 30, 20], birthBase: [48, 40, 30, 20], respecCount: 2, usedSkillPoints: 2, availableSkillPoints: 0 },
    }));
    expect(p.steps.map((s) => s.kind)).toEqual(["buy", "resetSkillPoints", "spendSkillPoints", "unequip", "equip"]);
  });
});
