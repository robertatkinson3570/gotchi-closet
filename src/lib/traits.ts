import type { Wearable } from "@/types";

const TRAIT_LENGTH = 6;

function normalizeTraits(values: number[] | undefined | null): number[] {
  const base = Array.isArray(values) ? values : [];
  const normalized = new Array(TRAIT_LENGTH).fill(0);
  for (let i = 0; i < TRAIT_LENGTH; i++) {
    normalized[i] = Number(base[i]) || 0;
  }
  return normalized;
}

export function sumTraits(a: number[], b: number[]): number[] {
  const left = normalizeTraits(a);
  const right = normalizeTraits(b);
  return left.map((val, i) => val + right[i]);
}

export function sumManyTraits(arrs: number[][]): number[] {
  if (arrs.length === 0) return normalizeTraits([]);
  return arrs.reduce((acc, arr) => sumTraits(acc, arr), normalizeTraits([]));
}

export function computeWearableDelta(
  equippedIds: number[],
  wearablesById: Map<number, Wearable>
): number[] {
  const deltas: number[][] = [];
  for (const id of equippedIds) {
    const wearable = wearablesById.get(id);
    if (wearable) {
      deltas.push(normalizeTraits(wearable.traitModifiers));
    }
  }
  return sumManyTraits(deltas);
}

export function getCanonicalModifiedTraits(
  baseTraits: number[],
  modifiedNumericTraits?: number[],
  localComputedTraits?: number[],
  withSetsNumericTraits?: number[]
): number[] {
  if (
    Array.isArray(withSetsNumericTraits) &&
    withSetsNumericTraits.length === 6 &&
    withSetsNumericTraits.every((value) => Number.isFinite(value))
  ) {
    return withSetsNumericTraits.map((value) => Number(value));
  }
  if (
    Array.isArray(modifiedNumericTraits) &&
    modifiedNumericTraits.length === 6 &&
    modifiedNumericTraits.every((value) => Number.isFinite(value))
  ) {
    return modifiedNumericTraits.map((value) => Number(value));
  }
  if (
    Array.isArray(localComputedTraits) &&
    localComputedTraits.length === 6 &&
    localComputedTraits.every((value) => Number.isFinite(value))
  ) {
    return localComputedTraits.map((value) => Number(value));
  }
  return normalizeTraits(baseTraits);
}

export function computeFinalTraits(
  base: number[],
  wearableDelta: number[],
  setDelta: number[]
): number[] {
  return sumTraits(sumTraits(base, wearableDelta), setDelta);
}

