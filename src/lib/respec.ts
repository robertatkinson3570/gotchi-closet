import { useEffect, useMemo, useState } from "react";
import { getCanonicalModifiedTraits } from "@/lib/traits";

const EDITABLE_COUNT = 4;
const respecBaseTraitsCache = new Map<string, number[]>();

export async function getRespecBaseTraits(tokenId: string): Promise<number[]> {
  const cached = respecBaseTraitsCache.get(tokenId);
  if (cached) return cached;
  const response = await fetch("/api/gotchis/base-traits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || "Failed to fetch base traits";
    throw new Error(message);
  }
  const traits = Array.isArray(payload?.baseTraits)
    ? payload.baseTraits.map((value: unknown) => Number(value) || 0)
    : [];
  if (traits.length < 6) {
    throw new Error("Base traits response was invalid");
  }
  respecBaseTraitsCache.set(tokenId, traits);
  return traits;
}

export function totalSpiritPoints(usedSkillPoints?: number): number {
  if (!Number.isFinite(usedSkillPoints)) return 0;
  return Math.max(0, Math.floor(usedSkillPoints as number));
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
  allocated: number[];
  wearableDelta?: number[];
  setDelta?: number[];
}) {
  const base = Array.isArray(params.respecBaseTraits)
    ? params.respecBaseTraits
    : params.baseTraits;
  const usingFallback = !Array.isArray(params.respecBaseTraits);
  const wearableDelta = Array.isArray(params.wearableDelta) ? params.wearableDelta : [0, 0, 0, 0];
  const setDelta = Array.isArray(params.setDelta) ? params.setDelta : [0, 0, 0, 0];
  const simBase = [0, 0, 0, 0];
  const simModified = [0, 0, 0, 0];

  for (let i = 0; i < EDITABLE_COUNT; i++) {
    const baseValue = Number(base[i]) || 0;
    const delta = Number(params.allocated[i]) || 0;
    const wearableMod = Number(wearableDelta[i]) || 0;
    const setMod = Number(setDelta[i]) || 0;
    simBase[i] = baseValue + delta;
    simModified[i] = simBase[i] + wearableMod + setMod;
  }

  return { simBase, simModified, usingFallback };
}

export function useRespecSimulator(params: {
  resetKey: string;
  usedSkillPoints?: number;
  baseTraits: number[];
  respecBaseTraits?: number[];
  wearableDelta?: number[];
  setDelta?: number[];
}) {
  const [isRespecMode, setIsRespecMode] = useState(false);
  const [allocated, setAllocated] = useState([0, 0, 0, 0]);
  const [committedAllocated, setCommittedAllocated] = useState<number[] | null>(null);

  useEffect(() => {
    setIsRespecMode(false);
    setAllocated([0, 0, 0, 0]);
    setCommittedAllocated(null);
  }, [params.resetKey]);

  const totalSP = totalSpiritPoints(params.usedSkillPoints);
  const used = allocated.reduce((acc, val) => acc + Math.abs(val), 0);
  const spLeft = Math.max(0, totalSP - used);
  const hasBaseline =
    Array.isArray(params.respecBaseTraits) && params.respecBaseTraits.length >= 6;

  const { simBase, simModified, usingFallback } = useMemo(
    () =>
      computeSimTraits({
        baseTraits: params.baseTraits,
        respecBaseTraits: params.respecBaseTraits,
        allocated,
        wearableDelta: params.wearableDelta,
        setDelta: params.setDelta,
      }),
    [params.baseTraits, params.respecBaseTraits, allocated, params.wearableDelta, params.setDelta]
  );

  const committedSim = useMemo(() => {
    if (!committedAllocated) return null;
    return computeSimTraits({
      baseTraits: params.baseTraits,
      respecBaseTraits: params.respecBaseTraits,
      allocated: committedAllocated,
      wearableDelta: params.wearableDelta,
      setDelta: params.setDelta,
    });
  }, [params.baseTraits, params.respecBaseTraits, committedAllocated, params.wearableDelta, params.setDelta]);

  const toggleRespecMode = () => {
    if (isRespecMode) {
      setCommittedAllocated([...allocated]);
      setIsRespecMode(false);
    } else {
      setAllocated([0, 0, 0, 0]);
      setIsRespecMode(true);
    }
  };

  const canIncrement = (index: number) => {
    const current = allocated[index];
    if (current < 0) return true;
    return spLeft > 0;
  };

  const canDecrement = (index: number) => {
    const current = allocated[index];
    if (current > 0) return true;
    return spLeft > 0;
  };

  const increment = (index: number) => {
    if (!canIncrement(index)) return;
    setAllocated((prev) => {
      const next = [...prev];
      next[index] += 1;
      return next;
    });
  };

  const decrement = (index: number) => {
    if (!canDecrement(index)) return;
    setAllocated((prev) => {
      const next = [...prev];
      next[index] -= 1;
      return next;
    });
  };

  const committedSpUsed = committedAllocated
    ? committedAllocated.reduce((acc, val) => acc + Math.abs(val), 0)
    : 0;

  return {
    isRespecMode,
    setIsRespecMode,
    toggleRespecMode,
    allocated,
    committedAllocated,
    committedSim,
    committedSpUsed,
    totalSP,
    spLeft,
    hasBaseline,
    simBase,
    simModified,
    usingFallback,
    increment,
    decrement,
    canIncrement,
    canDecrement,
  };
}

