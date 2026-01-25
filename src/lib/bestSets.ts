import { SETS, type SetDefinition } from "@/lib/sets";
import { traitsToBRS } from "@/lib/rarity";

export type RankedSet = {
  set: SetDefinition;
  scoreAfter: number;
  delta: number;
  bonusLabel: string;
  itemCount: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatBonus(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

export function computeBestSets(
  baseTraits: number[],
  limit = 10
): RankedSet[] {
  if (!Array.isArray(baseTraits) || baseTraits.length < 4) {
    return [];
  }

  const safeBaseTraits = baseTraits.map((v) => Number(v) || 0);
  const baseScore = traitsToBRS(safeBaseTraits);

  const ranked: RankedSet[] = [];

  for (const set of SETS) {
    const mods = set.traitModifiers;
    const t = [...safeBaseTraits];

    t[0] = clamp(t[0] + (mods.nrg || 0), 0, 100);
    t[1] = clamp(t[1] + (mods.agg || 0), 0, 100);
    t[2] = clamp(t[2] + (mods.spk || 0), 0, 100);
    t[3] = clamp(t[3] + (mods.brn || 0), 0, 100);

    const traitScore = traitsToBRS(t);
    const scoreAfter = traitScore + (set.setBonusBRS || 0);
    const delta = scoreAfter - baseScore;

    const bonusLabel = [
      `BRS ${formatBonus(set.setBonusBRS || 0)}`,
      `NRG ${formatBonus(mods.nrg || 0)}`,
      `AGG ${formatBonus(mods.agg || 0)}`,
      `SPK ${formatBonus(mods.spk || 0)}`,
      `BRN ${formatBonus(mods.brn || 0)}`,
    ].join(" · ");

    ranked.push({
      set,
      scoreAfter,
      delta,
      bonusLabel,
      itemCount: set.requiredWearableIds.length,
    });
  }

  ranked.sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    if (b.set.setBonusBRS !== a.set.setBonusBRS) return b.set.setBonusBRS - a.set.setBonusBRS;
    const aMoves = Math.abs(a.set.traitModifiers.nrg || 0) +
                   Math.abs(a.set.traitModifiers.agg || 0) +
                   Math.abs(a.set.traitModifiers.spk || 0) +
                   Math.abs(a.set.traitModifiers.brn || 0);
    const bMoves = Math.abs(b.set.traitModifiers.nrg || 0) +
                   Math.abs(b.set.traitModifiers.agg || 0) +
                   Math.abs(b.set.traitModifiers.spk || 0) +
                   Math.abs(b.set.traitModifiers.brn || 0);
    return bMoves - aMoves;
  });

  return ranked.slice(0, limit);
}
