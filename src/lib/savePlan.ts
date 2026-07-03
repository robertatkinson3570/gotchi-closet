export type SaveStep =
  | { kind: "buy"; wearableId: number; listingId: string; priceInWei: string; quantity: number }
  | { kind: "resetSkillPoints" }
  | { kind: "spendSkillPoints"; values: number[] }
  | { kind: "unequip"; gotchiId: string; slots16: number[]; stolen: number[] }
  | { kind: "equip"; gotchiId: string; slots16: number[] };

export type SavePlanInput = {
  targetGotchiId: string;
  desiredSlots: number[];   // length 8
  currentSlots: number[];   // length 8, on-chain state of the target
  walletBalances: Record<number, number>;
  ownedGotchis: { gotchiId: string; equippedWearables: number[]; locked: boolean }[];
  respec: {
    targetBase: number[];
    birthBase: number[];
    respecCount: number;
    usedSkillPoints: number;      // points refunded by resetSkillPoints
    availableSkillPoints: number; // unspent on-chain points
  } | null;
  listingsByWearable: Record<number, { listingId: string; priceInWei: string }>;
};

export type SaveBlocked =
  | { reason: "unobtainable"; wearableId: number }
  | { reason: "respec-pool"; needed: number; available: number };

export type SavePlan = {
  steps: SaveStep[];
  warnings: { wearableId: number; fromGotchiId: string }[];
  blocked: SaveBlocked[];
  totalBuyCostWei: bigint;
};

const to16 = (slots8: number[]): number[] =>
  [...slots8, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16).map((n) => Number(n) || 0);

/**
 * Deterministic save classifier (spec: docs/superpowers/specs/2026-07-02-dress-save-to-gotchi-design.md).
 * Resolves every needed wearable copy in priority order:
 * on-target → wallet → steal from owned unlocked gotchi → cheapest listing → blocked.
 * Duplicate ids are counted per copy. Step order: buys → respec → unequips → equip.
 * Any blocked wearable empties the plan — no partial saves.
 */
export function planSave(input: SavePlanInput): SavePlan {
  const warnings: SavePlan["warnings"] = [];
  const blocked: SavePlan["blocked"] = [];
  const buys: SaveStep[] = [];
  let totalBuyCostWei = 0n;

  const needed = new Map<number, number>();
  for (const id of input.desiredSlots) {
    if (id) needed.set(id, (needed.get(id) || 0) + 1);
  }
  const onTarget = new Map<number, number>();
  for (const id of input.currentSlots) {
    if (id) onTarget.set(id, (onTarget.get(id) || 0) + 1);
  }

  const wallet = { ...input.walletBalances };
  const sources = input.ownedGotchis
    .filter((g) => !g.locked && g.gotchiId !== input.targetGotchiId)
    .map((g) => ({ gotchiId: g.gotchiId, slots: [...g.equippedWearables] }));
  const stolenBySource = new Map<string, number[]>();

  for (const [id, count] of needed) {
    let remaining = count - (onTarget.get(id) || 0);
    while (remaining > 0 && (wallet[id] || 0) > 0) {
      wallet[id] -= 1;
      remaining -= 1;
    }
    while (remaining > 0) {
      const src = sources.find((s) => s.slots.includes(id));
      if (!src) break;
      src.slots[src.slots.indexOf(id)] = 0;
      const stolen = stolenBySource.get(src.gotchiId) || [];
      stolen.push(id);
      stolenBySource.set(src.gotchiId, stolen);
      warnings.push({ wearableId: id, fromGotchiId: src.gotchiId });
      remaining -= 1;
    }
    // One listing per id; buying multiple copies of the same id in one save is
    // out of scope — blocked instead. Keeps the flow predictable.
    if (remaining === 1 && input.listingsByWearable[id]) {
      const l = input.listingsByWearable[id];
      buys.push({ kind: "buy", wearableId: id, listingId: l.listingId, priceInWei: l.priceInWei, quantity: 1 });
      totalBuyCostWei += BigInt(l.priceInWei);
      remaining = 0;
    }
    if (remaining > 0) blocked.push({ wearableId: id, reason: "unobtainable" });
  }

  // C-1: respec pool validation. spendSkillPoints reverts on-chain when the
  // allocation exceeds refunded (usedSkillPoints) + unspent (availableSkillPoints)
  // points — and by then resetSkillPoints has already succeeded, leaving the
  // gotchi stripped of its spec with the respec fee burned. Block up front.
  if (input.respec) {
    const needed = input.respec.targetBase.reduce(
      (sum, t, i) =>
        sum + Math.abs((Number(t) || 0) - (Number(input.respec!.birthBase[i]) || 0)),
      0
    );
    const available =
      (Number(input.respec.usedSkillPoints) || 0) +
      (Number(input.respec.availableSkillPoints) || 0);
    if (needed > available) {
      blocked.push({ reason: "respec-pool", needed, available });
    }
  }

  if (blocked.length > 0) {
    return { steps: [], warnings, blocked, totalBuyCostWei: 0n };
  }

  const steps: SaveStep[] = [...buys];

  if (input.respec) {
    // usedSkillPoints === 0 → nothing to refund: resetSkillPoints would burn a
    // fee for no effect, so spend alone suffices.
    if ((Number(input.respec.usedSkillPoints) || 0) > 0) {
      steps.push({ kind: "resetSkillPoints" });
    }
    const values = input.respec.targetBase.map(
      (t, i) => (Number(t) || 0) - (Number(input.respec!.birthBase[i]) || 0)
    );
    if (values.some((v) => v !== 0)) {
      steps.push({ kind: "spendSkillPoints", values });
    }
  }

  for (const src of input.ownedGotchis) {
    const stolen = stolenBySource.get(src.gotchiId);
    if (!stolen) continue;
    const remainingSlots = sources.find((s) => s.gotchiId === src.gotchiId)!.slots;
    steps.push({ kind: "unequip", gotchiId: src.gotchiId, slots16: to16(remainingSlots), stolen });
  }

  const outfitChanged = input.desiredSlots.some((id, i) => (id || 0) !== (input.currentSlots[i] || 0));
  if (outfitChanged) {
    steps.push({ kind: "equip", gotchiId: input.targetGotchiId, slots16: to16(input.desiredSlots) });
  }

  return { steps, warnings, blocked, totalBuyCostWei };
}
