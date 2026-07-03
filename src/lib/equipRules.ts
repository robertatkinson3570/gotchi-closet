import type { Wearable } from "@/types";

/**
 * Single source of truth for "can this wearable go in this slot" (audit M3/H6).
 * Logic lifted from the previously-correct DressPage.handleDragEnd: hand slots
 * (4 = left, 5 = right) additionally honor `handPlacement`.
 */
export function canEquipInSlot(wearable: Wearable, slotIndex: number): boolean {
  if (!wearable.slotPositions?.[slotIndex]) return false;
  const hp = wearable.handPlacement || "none";
  const isLeft = slotIndex === 4;
  const isRight = slotIndex === 5;
  if (!isLeft && !isRight) return true;
  return (
    hp === "either" ||
    (hp === "left" && isLeft) ||
    (hp === "right" && isRight) ||
    (hp === "none" && !!wearable.slotPositions[slotIndex])
  );
}

export function allowedSlotsFor(wearable: Wearable): number[] {
  return wearable.slotPositions
    .map((_, i) => i)
    .filter((i) => canEquipInSlot(wearable, i));
}

/** Greedy slot assignment for a set's pieces; hand pieces fill free hand slots. */
export function assignSetSlots(
  pieces: Wearable[]
): { wearableId: number; slot: number }[] {
  const taken = new Set<number>();
  const placed: { wearableId: number; slot: number }[] = [];
  for (const piece of pieces) {
    const slot = allowedSlotsFor(piece).find((s) => !taken.has(s));
    if (slot === undefined) continue; // unplaceable — caller reports
    taken.add(slot);
    placed.push({ wearableId: piece.id, slot });
  }
  return placed;
}
