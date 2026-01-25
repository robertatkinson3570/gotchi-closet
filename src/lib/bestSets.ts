import setsByTraitDirection from "../../data/setsByTraitDirection.json";
import { traitsToBRS } from "@/lib/rarity";

type SetData = {
  name: string;
  setBonusBRS: number;
  mods: {
    nrg?: number;
    agg?: number;
    spk?: number;
    brn?: number;
  };
};

export type RankedSet = {
  set: SetData;
  scoreAfter: number;
  delta: number;
  bonusLabel: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatBonus(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function isModCompatible(traitValue: number, mod: number): boolean {
  if (mod === 0) return true;
  if (traitValue >= 50) return mod > 0;
  return mod < 0;
}

export function computeBestSets(
  baseTraits: number[],
  limit = 0
): RankedSet[] {
  if (!Array.isArray(baseTraits) || baseTraits.length < 4) {
    return [];
  }

  const safeBaseTraits = baseTraits.map((v) => Number(v) || 0);
  const baseScore = traitsToBRS(safeBaseTraits);

  const ranked: RankedSet[] = [];
  const sets = setsByTraitDirection.sets as SetData[];

  for (const set of sets) {
    const mods = set.mods;
    
    const nrgMod = mods.nrg || 0;
    const aggMod = mods.agg || 0;
    const spkMod = mods.spk || 0;
    const brnMod = mods.brn || 0;

    const compatible =
      isModCompatible(safeBaseTraits[0], nrgMod) &&
      isModCompatible(safeBaseTraits[1], aggMod) &&
      isModCompatible(safeBaseTraits[2], spkMod) &&
      isModCompatible(safeBaseTraits[3], brnMod);

    if (!compatible) continue;

    const t = [...safeBaseTraits];
    t[0] = clamp(t[0] + nrgMod, 0, 100);
    t[1] = clamp(t[1] + aggMod, 0, 100);
    t[2] = clamp(t[2] + spkMod, 0, 100);
    t[3] = clamp(t[3] + brnMod, 0, 100);

    const traitScore = traitsToBRS(t);
    const scoreAfter = traitScore + (set.setBonusBRS || 0);
    const delta = scoreAfter - baseScore;

    const bonusLabel = [
      `BRS ${formatBonus(set.setBonusBRS || 0)}`,
      `NRG ${formatBonus(nrgMod)}`,
      `AGG ${formatBonus(aggMod)}`,
      `SPK ${formatBonus(spkMod)}`,
      `BRN ${formatBonus(brnMod)}`,
    ].join(" · ");

    ranked.push({
      set,
      scoreAfter,
      delta,
      bonusLabel,
    });
  }

  ranked.sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    if (b.set.setBonusBRS !== a.set.setBonusBRS) return b.set.setBonusBRS - a.set.setBonusBRS;
    const aMoves = Math.abs(a.set.mods.nrg || 0) +
                   Math.abs(a.set.mods.agg || 0) +
                   Math.abs(a.set.mods.spk || 0) +
                   Math.abs(a.set.mods.brn || 0);
    const bMoves = Math.abs(b.set.mods.nrg || 0) +
                   Math.abs(b.set.mods.agg || 0) +
                   Math.abs(b.set.mods.spk || 0) +
                   Math.abs(b.set.mods.brn || 0);
    return bMoves - aMoves;
  });

  return limit > 0 ? ranked.slice(0, limit) : ranked;
}
