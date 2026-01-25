import setsByTraitDirection from "../../data/setsByTraitDirection.json";

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

    const bonusLabel = [
      `BRS ${formatBonus(set.setBonusBRS || 0)}`,
      `NRG ${formatBonus(nrgMod)}`,
      `AGG ${formatBonus(aggMod)}`,
      `SPK ${formatBonus(spkMod)}`,
      `BRN ${formatBonus(brnMod)}`,
    ].join(" · ");

    ranked.push({
      set,
      scoreAfter: set.setBonusBRS || 0,
      delta: set.setBonusBRS || 0,
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
