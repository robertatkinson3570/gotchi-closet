import { describe, expect, it } from "vitest";
import { canEquipInSlot, allowedSlotsFor, assignSetSlots } from "@/lib/equipRules";
import type { Wearable } from "@/types";

const w = (over: Partial<Wearable>): Wearable => ({
  id: 1,
  name: "W",
  traitModifiers: [],
  rarityScoreModifier: 0,
  category: 0,
  slotPositions: [false, false, false, false, true, true, false, false],
  handPlacement: "either",
  ...over,
});

describe("equip rules (audit M3/H6)", () => {
  it("left-only wearable cannot go in the right hand even if slotPositions[5] is true", () => {
    expect(canEquipInSlot(w({ handPlacement: "left" }), 5)).toBe(false);
    expect(canEquipInSlot(w({ handPlacement: "left" }), 4)).toBe(true);
  });

  it("either-hand wearable can go in both", () => {
    expect(allowedSlotsFor(w({}))).toEqual([4, 5]);
  });

  it("non-hand slots only require slotPositions", () => {
    const body = w({
      slotPositions: [true, false, false, false, false, false, false, false],
      handPlacement: "none",
    });
    expect(canEquipInSlot(body, 0)).toBe(true);
    expect(canEquipInSlot(body, 1)).toBe(false);
    expect(allowedSlotsFor(body)).toEqual([0]);
  });

  it("handPlacement none in a hand slot follows slotPositions", () => {
    expect(canEquipInSlot(w({ handPlacement: "none" }), 4)).toBe(true);
    expect(canEquipInSlot(w({ handPlacement: "none" }), 5)).toBe(true);
  });

  it("assignSetSlots places two either-hand pieces into left AND right", () => {
    const a = w({ id: 1 });
    const b = w({ id: 2 });
    expect(assignSetSlots([a, b])).toEqual([
      { wearableId: 1, slot: 4 },
      { wearableId: 2, slot: 5 },
    ]);
  });

  it("assignSetSlots skips unplaceable pieces", () => {
    const a = w({ id: 1, handPlacement: "left" });
    const b = w({ id: 2, handPlacement: "left" });
    expect(assignSetSlots([a, b])).toHaveLength(1);
    expect(assignSetSlots([a, b])[0]).toEqual({ wearableId: 1, slot: 4 });
  });
});
