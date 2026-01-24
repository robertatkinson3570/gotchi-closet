import { useEffect, useMemo, useState } from "react";
import { getCanonicalModifiedTraits } from "@/lib/traits";

const EDITABLE_COUNT = 4;

export function totalSpiritPoints(level?: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.floor((level as number) / 3);
}

export function computeWearableDelta(
  baseTraits: number[],
  modifiedTraits?: number[],
  localComputedTraits?: number[],
  withSetsTraits?: number[]
): number[] {
  const delta = [0, 0, 0, 0];
  const canonical = getCanonicalModifiedTraits(
    baseTraits,
    modifiedTraits,
    localComputedTraits,
    withSetsTraits
  );
  for (let i = 0; i < EDITABLE_COUNT; i++) {
    const base = Number(baseTraits[i]) || 0;
    const mod = Number(canonical[i]) || 0;
    delta[i] = mod - base;
  }
  return delta;
}

export function computeSimTraits(params: {
  baseTraits: number[];
  respecBaseTraits?: number[];
  wearableDelta: number[];
  allocated: number[];
}) {
  const base = Array.isArray(params.respecBaseTraits)
    ? params.respecBaseTraits
    : params.baseTraits;
  const usingFallback = !Array.isArray(params.respecBaseTraits);
  const simBase = [0, 0, 0, 0];
  const simModified = [0, 0, 0, 0];

  for (let i = 0; i < EDITABLE_COUNT; i++) {
    const baseValue = Number(base[i]) || 0;
    const delta = Number(params.allocated[i]) || 0;
    simBase[i] = baseValue + delta;
    simModified[i] = simBase[i] + (Number(params.wearableDelta[i]) || 0);
  }

  return { simBase, simModified, usingFallback };
}

export function useRespecSimulator(params: {
  resetKey: string;
  level?: number;
  baseTraits: number[];
  modifiedTraits?: number[];
  canonicalModifiedTraits?: number[];
  withSetsNumericTraits?: number[];
  respecBaseTraits?: number[];
  wearableDeltaOverride?: number[];
}) {
  const [isRespecMode, setIsRespecMode] = useState(false);
  const [allocated, setAllocated] = useState([0, 0, 0, 0]);

  useEffect(() => {
    setIsRespecMode(false);
    setAllocated([0, 0, 0, 0]);
  }, [params.resetKey]);

  const totalSP = totalSpiritPoints(params.level);
  const used = allocated.reduce((acc, val) => acc + val, 0);
  const spLeft = Math.max(0, totalSP - used);

  const wearableDelta = useMemo(() => {
    if (params.wearableDeltaOverride) {
      return params.wearableDeltaOverride.slice(0, EDITABLE_COUNT);
    }
    return computeWearableDelta(
      params.baseTraits,
      params.modifiedTraits,
      params.canonicalModifiedTraits,
      params.withSetsNumericTraits
    );
  }, [
    params.baseTraits,
    params.modifiedTraits,
    params.canonicalModifiedTraits,
    params.withSetsNumericTraits,
    params.wearableDeltaOverride,
  ]);

  const { simBase, simModified, usingFallback } = useMemo(
    () =>
      computeSimTraits({
        baseTraits: params.baseTraits,
        respecBaseTraits: params.respecBaseTraits,
        wearableDelta,
        allocated,
      }),
    [params.baseTraits, params.respecBaseTraits, wearableDelta, allocated]
  );

  const increment = (index: number) => {
    if (spLeft <= 0) return;
    setAllocated((prev) => {
      const next = [...prev];
      next[index] += 1;
      return next;
    });
  };

  const decrement = (index: number) => {
    setAllocated((prev) => {
      if (prev[index] <= 0) return prev;
      const next = [...prev];
      next[index] -= 1;
      return next;
    });
  };

  return {
    isRespecMode,
    setIsRespecMode,
    allocated,
    totalSP,
    spLeft,
    wearableDelta,
    simBase,
    simModified,
    usingFallback,
    increment,
    decrement,
  };
}

