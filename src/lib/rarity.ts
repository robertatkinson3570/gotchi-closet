import type { Wearable } from "@/types";
import { SETS, type SetDefinition } from "@/lib/sets";
import { ageBRSFromBlocksElapsed } from "@/lib/age";
import { getCanonicalModifiedTraits } from "@/lib/traits";

export type NumericTraits = [number, number, number, number, number, number];
export type CoreTraitMods = {
  nrg?: number;
  agg?: number;
  spk?: number;
  brn?: number;
};

const TRAIT_COUNT = 6;

function normalizeTraits(values: number[] | undefined | null): NumericTraits {
  const safe = Array.isArray(values) ? values : [];
  return [
    Number(safe[0]) || 0,
    Number(safe[1]) || 0,
    Number(safe[2]) || 0,
    Number(safe[3]) || 0,
    Number(safe[4]) || 0,
    Number(safe[5]) || 0,
  ];
}

export function traitToBRS(value: number): number {
  const t = Number.isFinite(value) ? value : 0;
  return t < 50 ? 100 - t : t + 1;
}

export function traitsToBRS(traits: number[]): number {
  const safe = normalizeTraits(traits);
  let total = 0;
  for (let i = 0; i < TRAIT_COUNT; i++) {
    total += traitToBRS(safe[i]);
  }
  return total;
}

export function applyCoreTraitMods(
  baseTraits: number[],
  mods: CoreTraitMods
): NumericTraits {
  const base = normalizeTraits(baseTraits);
  return [
    base[0] + (mods.nrg || 0),
    base[1] + (mods.agg || 0),
    base[2] + (mods.spk || 0),
    base[3] + (mods.brn || 0),
    base[4],
    base[5],
  ];
}

export function brsDeltaFromCoreMods(
  baseTraits: number[],
  mods: CoreTraitMods
): number {
  return traitsToBRS(applyCoreTraitMods(baseTraits, mods)) - traitsToBRS(baseTraits);
}

export function setRarityDelta(params: {
  baseTraits: number[];
  wearableTraitMods: CoreTraitMods;
  setTraitMods: CoreTraitMods;
  setFlatBRS: number;
}): number {
  const traitsWithWearables = applyCoreTraitMods(
    params.baseTraits,
    params.wearableTraitMods
  );
  const traitsWithSet = applyCoreTraitMods(
    traitsWithWearables,
    params.setTraitMods
  );
  const traitDelta =
    traitsToBRS(traitsWithSet) - traitsToBRS(traitsWithWearables);
  return (params.setFlatBRS || 0) + traitDelta;
}

export function computeTotalBRS(params: {
  baseTraits: number[];
  wearableTraitMods: CoreTraitMods;
  wearableFlatBRS: number;
  setTraitMods: CoreTraitMods;
  setFlatBRS: number;
  ageBRS: number;
  finalTraits?: number[];
}): number {
  const useFinalTraits =
    Array.isArray(params.finalTraits) &&
    params.finalTraits.length === 6 &&
    params.finalTraits.every((value) => Number.isFinite(value));
  const traitWithMods = useFinalTraits
    ? traitsToBRS(params.finalTraits as number[])
    : (() => {
        const traitsWithWearables = applyCoreTraitMods(
          params.baseTraits,
          params.wearableTraitMods
        );
        const traitsWithSet = applyCoreTraitMods(
          traitsWithWearables,
          params.setTraitMods
        );
        return traitsToBRS(traitsWithSet);
      })();
  return (
    traitWithMods +
    (params.wearableFlatBRS || 0) +
    (params.setFlatBRS || 0) +
    (params.ageBRS || 0)
  );
}

// Backwards-compatible exports
export function traitBrsForValue(value: number): number {
  return traitToBRS(value);
}

export function sumTraitBrs(traits: number[]): number {
  return traitsToBRS(traits);
}

export function wearableFlatBrs(
  rarity: "common" | "uncommon" | "rare" | "legendary" | "mythical" | "godlike"
): number {
  switch (rarity) {
    case "common":
      return 1;
    case "uncommon":
      return 2;
    case "rare":
      return 5;
    case "legendary":
      return 10;
    case "mythical":
      return 20;
    case "godlike":
      return 50;
    default:
      return 0;
  }
}

export function detectActiveSets(equippedWearableIds: number[]): SetDefinition[] {
  const equipped = new Set(equippedWearableIds);
  return SETS.filter((set) =>
    set.requiredWearableIds.every((id) => equipped.has(id))
  );
}

function sumSetBonusBrs(sets: SetDefinition[]): number {
  return sets.reduce((acc, set) => acc + (set.setBonusBRS || 0), 0);
}

export function ageBrsFromBlocks(blocksElapsed: number): number {
  return ageBRSFromBlocksElapsed(blocksElapsed);
}

function wearableRarityToBrs(wearable: Wearable): number {
  const rarity = wearable.rarity?.toLowerCase();
  if (
    rarity === "common" ||
    rarity === "uncommon" ||
    rarity === "rare" ||
    rarity === "legendary" ||
    rarity === "mythical" ||
    rarity === "godlike"
  ) {
    return wearableFlatBrs(rarity);
  }
  return wearable.rarityScoreModifier || 0;
}

function sumWearableCoreMods(
  equippedWearables: number[],
  wearablesById: Map<number, Wearable>
): CoreTraitMods {
  let nrg = 0;
  let agg = 0;
  let spk = 0;
  let brn = 0;
  for (const id of equippedWearables) {
    if (!id) continue;
    const wearable = wearablesById.get(id);
    if (!wearable || !Array.isArray(wearable.traitModifiers)) continue;
    nrg += Number(wearable.traitModifiers[0]) || 0;
    agg += Number(wearable.traitModifiers[1]) || 0;
    spk += Number(wearable.traitModifiers[2]) || 0;
    brn += Number(wearable.traitModifiers[3]) || 0;
  }
  return { nrg, agg, spk, brn };
}

function sumSetCoreMods(sets: SetDefinition[]): CoreTraitMods {
  let nrg = 0;
  let agg = 0;
  let spk = 0;
  let brn = 0;
  for (const set of sets) {
    nrg += set.traitModifiers.nrg || 0;
    agg += set.traitModifiers.agg || 0;
    spk += set.traitModifiers.spk || 0;
    brn += set.traitModifiers.brn || 0;
  }
  return { nrg, agg, spk, brn };
}

export function computeBRSBreakdown(params: {
  baseTraits: number[];
  modifiedNumericTraits?: number[];
  withSetsNumericTraits?: number[];
  equippedWearables: number[];
  wearablesById: Map<number, Wearable>;
  blocksElapsed?: number;
  ageBrsOverride?: number;
}) {
  const activeSets = detectActiveSets(params.equippedWearables);
  const wearableTraitMods = sumWearableCoreMods(
    params.equippedWearables,
    params.wearablesById
  );
  const setTraitMods = sumSetCoreMods(activeSets);
  const traitsWithWearables = applyCoreTraitMods(
    params.baseTraits,
    wearableTraitMods
  );
  const localFinalTraits = applyCoreTraitMods(traitsWithWearables, setTraitMods);
  const finalTraits = getCanonicalModifiedTraits(
    params.baseTraits,
    params.modifiedNumericTraits,
    localFinalTraits,
    params.withSetsNumericTraits
  );
  const traitBase = traitsToBRS(params.baseTraits);
  const traitWithMods = traitsToBRS(finalTraits);
  let wearableFlat = 0;
  for (const id of params.equippedWearables) {
    if (!id) continue;
    const wearable = params.wearablesById.get(id);
    if (!wearable) continue;
    wearableFlat += wearableRarityToBrs(wearable);
  }
  const setFlatBrs = sumSetBonusBrs(activeSets);
  const setDeltaTotal = setRarityDelta({
    baseTraits: params.baseTraits,
    wearableTraitMods,
    setTraitMods,
    setFlatBRS: setFlatBrs,
  });
  const setTraitDelta = setDeltaTotal - setFlatBrs;
  const ageEnabled =
    typeof import.meta !== "undefined" &&
    typeof import.meta.env !== "undefined" &&
    import.meta.env.VITE_ENABLE_AGE_BRS === "true";
  const ageBrs =
    typeof params.ageBrsOverride === "number"
      ? params.ageBrsOverride
      : ageEnabled && params.blocksElapsed
      ? ageBrsFromBlocks(params.blocksElapsed)
      : 0;
  const totalBrs = computeTotalBRS({
    baseTraits: params.baseTraits,
    wearableTraitMods,
    wearableFlatBRS: wearableFlat,
    setTraitMods,
    setFlatBRS: setFlatBrs,
    ageBRS: ageBrs,
    finalTraits,
  });

  return {
    finalTraits,
    traitBase,
    traitWithMods,
    wearableFlat,
    setFlatBrs,
    setTraitDelta,
    setDeltaTotal,
    ageBrs,
    totalBrs,
    activeSets,
    wearableTraitMods,
    setTraitMods,
  };
}

