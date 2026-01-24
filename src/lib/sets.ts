import wearableSetsData from "../../data/wearableSets.json";
import { toSlug } from "@/lib/slug";

export type SetDefinition = {
  id: string;
  name: string;
  requiredWearableIds: number[];
  setBonusBRS: number;
  traitModifiers: {
    nrg?: number;
    agg?: number;
    spk?: number;
    brn?: number;
  };
};

type RawSet = {
  id: string;
  name: string;
  wearableIds: number[];
  traitBonuses: number[];
  setBonusBRS: number;
};

const rawSets = wearableSetsData as RawSet[];

export function parseSetDefinition(rawSet: RawSet) {
  const name = rawSet.name?.trim() || rawSet.id;
  if (!name) {
    throw new Error("Invalid set definition: missing name/id");
  }
  if (!Array.isArray(rawSet.traitBonuses)) {
    throw new Error(`Set ${name}: traitBonuses missing`);
  }
  if (rawSet.traitBonuses.length !== 6) {
    throw new Error(`Set ${name}: traitBonuses length must be 6`);
  }
  const bonuses = rawSet.traitBonuses.map((value, index) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Set ${name}: traitBonuses[${index}] is not a number`);
    }
    return num;
  });
  if (bonuses[4] !== 0 || bonuses[5] !== 0) {
    throw new Error(`Set ${name}: eye trait bonuses must be 0`);
  }
  if (!Number.isFinite(rawSet.setBonusBRS)) {
    throw new Error(`Set ${name}: setBonusBRS missing or invalid`);
  }

  return {
    name,
    setBonusBRS: Number(rawSet.setBonusBRS),
    traitModifiers: {
      nrg: bonuses[0] || 0,
      agg: bonuses[1] || 0,
      spk: bonuses[2] || 0,
      brn: bonuses[3] || 0,
    },
  };
}

export const SETS: SetDefinition[] = rawSets.map((set) => {
  const cleanName = set.name?.trim() || set.id;
  const parsed = parseSetDefinition(set);
  return {
    id: toSlug(cleanName),
    name: parsed.name,
    requiredWearableIds: Array.isArray(set.wearableIds)
      ? set.wearableIds.map((id) => Number(id) || 0).filter((id) => id > 0)
      : [],
    setBonusBRS: parsed.setBonusBRS,
    traitModifiers: parsed.traitModifiers,
  };
});

// Backwards-compatible helper for UI filters built on wearableSets.json

