import { useAppStore } from "./useAppStore";
import { computeBRSBreakdown } from "@/lib/rarity";
import type { Wearable } from "@/types";

export function useWearablesById() {
  const wearables = useAppStore((state) => state.wearables);
  const map = new Map<number, Wearable>();
  for (const w of wearables) {
    map.set(w.id, w);
  }
  return map;
}

export function useSortedGotchis() {
  const gotchis = useAppStore((state) => state.gotchis);
  const wearablesById = useWearablesById();
  return [...gotchis].sort((a, b) => {
    const traitsA = computeInstanceTraits({
      baseTraits: a.numericTraits,
      modifiedNumericTraits: a.modifiedNumericTraits,
      withSetsNumericTraits: a.withSetsNumericTraits,
      equippedBySlot: a.equippedWearables,
      wearablesById,
      blocksElapsed: a.blocksElapsed,
    }).totalBrs;
    const traitsB = computeInstanceTraits({
      baseTraits: b.numericTraits,
      modifiedNumericTraits: b.modifiedNumericTraits,
      withSetsNumericTraits: b.withSetsNumericTraits,
      equippedBySlot: b.equippedWearables,
      wearablesById,
      blocksElapsed: b.blocksElapsed,
    }).totalBrs;
    return traitsB - traitsA;
  });
}

export function computeInstanceTraits(params: {
  baseTraits: number[];
  modifiedNumericTraits?: number[];
  withSetsNumericTraits?: number[];
  equippedBySlot: number[];
  wearablesById: Map<number, Wearable>;
  blocksElapsed?: number;
}) {
  const baseTraits = params.baseTraits;
  const equippedBySlot = [...params.equippedBySlot];
  const equippedIds = equippedBySlot.filter((id) => id !== 0);

  if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_TRAITS) {
    const slotLabels = [
      "body",
      "face",
      "eyes",
      "head",
      "leftHand",
      "rightHand",
      "pet",
      "background",
    ];
    const bySlot = equippedBySlot.map((id, idx) => ({
      slot: slotLabels[idx],
      id,
    }));
    const mods = equippedIds.map((id) => {
      const wearable = params.wearablesById.get(id);
      const traitModifiers = wearable?.traitModifiers?.slice(0, 4) || [0, 0, 0, 0];
      return { id, name: wearable?.name, traitModifiers };
    });
    const sums = mods.reduce(
      (acc, item) => {
        acc.nrg += Number(item.traitModifiers[0]) || 0;
        acc.agg += Number(item.traitModifiers[1]) || 0;
        acc.spk += Number(item.traitModifiers[2]) || 0;
        acc.brn += Number(item.traitModifiers[3]) || 0;
        return acc;
      },
      { nrg: 0, agg: 0, spk: 0, brn: 0 }
    );
    console.debug("[traits-debug]", { baseTraits, bySlot, mods, sums });
  }
  const breakdown = computeBRSBreakdown({
    baseTraits,
    modifiedNumericTraits: params.modifiedNumericTraits,
    withSetsNumericTraits: params.withSetsNumericTraits,
    equippedWearables: equippedIds,
    wearablesById: params.wearablesById,
    blocksElapsed: params.blocksElapsed,
  });
  const wearableDelta = [
    breakdown.wearableTraitMods?.nrg ?? 0,
    breakdown.wearableTraitMods?.agg ?? 0,
    breakdown.wearableTraitMods?.spk ?? 0,
    breakdown.wearableTraitMods?.brn ?? 0,
  ];
  const setTraitModsDelta = [
    breakdown.setTraitMods?.nrg ?? 0,
    breakdown.setTraitMods?.agg ?? 0,
    breakdown.setTraitMods?.spk ?? 0,
    breakdown.setTraitMods?.brn ?? 0,
  ];
  return {
    baseScore: breakdown.traitBase,
    modifiedScore: breakdown.traitWithMods,
    traitBase: breakdown.traitBase,
    traitWithMods: breakdown.traitWithMods,
    wearableFlat: breakdown.wearableFlat,
    setFlatBrs: breakdown.setFlatBrs,
    setTraitDelta: breakdown.setTraitDelta,
    setDeltaTotal: breakdown.setDeltaTotal,
    ageBrs: breakdown.ageBrs,
    totalBrs: breakdown.totalBrs,
    activeSets: breakdown.activeSets,
    equippedIds,
    finalTraits: breakdown.finalTraits,
    wearableDelta,
    setTraitModsDelta,
  };
}

