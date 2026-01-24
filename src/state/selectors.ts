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
  const equippedIds = params.equippedBySlot.filter((id) => id !== 0);
  const breakdown = computeBRSBreakdown({
    baseTraits,
    modifiedNumericTraits: params.modifiedNumericTraits,
    withSetsNumericTraits: params.withSetsNumericTraits,
    equippedWearables: equippedIds,
    wearablesById: params.wearablesById,
    blocksElapsed: params.blocksElapsed,
  });
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
  };
}

