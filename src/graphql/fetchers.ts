import { client } from "./client";
import { GOTCHIS_BY_OWNER, GOTCHI_BY_TOKEN_ID, GOTCHIS_SEARCH, WEARABLES } from "./queries";
import type { Gotchi, Wearable, WearableSet } from "@/types";
import wearablesData from "../../data/wearables.json";
import wearableSetsData from "../../data/wearableSets.json";

export async function fetchGotchisByOwner(
  owner: string
): Promise<Gotchi[]> {
  const result = await client
    .query(GOTCHIS_BY_OWNER, { owner: owner.toLowerCase() })
    .toPromise();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const gotchis = result.data?.user?.gotchisOwned || [];
  const currentBlock = Number(result.data?._meta?.block?.number) || null;
  return gotchis.map((g: any) => ({
    id: g.id,
    gotchiId:
      typeof g.id === "string"
        ? g.id.split("-").slice(-1)[0] || undefined
        : undefined,
    name: g.name || "Unnamed Gotchi",
    level: g.level ? Number(g.level) : undefined,
    numericTraits: Array.isArray(g.numericTraits)
      ? g.numericTraits.map((t: any) => Number(t) || 0)
      : [0, 0, 0, 0, 0, 0],
    modifiedNumericTraits: Array.isArray(g.modifiedNumericTraits)
      ? g.modifiedNumericTraits.map((t: any) => Number(t) || 0)
      : undefined,
    withSetsNumericTraits: Array.isArray(g.withSetsNumericTraits)
      ? g.withSetsNumericTraits.map((t: any) => Number(t) || 0)
      : undefined,
    equippedWearables: Array.isArray(g.equippedWearables)
      ? g.equippedWearables.map((w: any) => Number(w) || 0)
      : [0, 0, 0, 0, 0, 0, 0, 0],
    baseRarityScore: g.baseRarityScore ? Number(g.baseRarityScore) : null,
    usedSkillPoints: g.usedSkillPoints ? Number(g.usedSkillPoints) : undefined,
    hauntId: g.hauntId ? Number(g.hauntId) : undefined,
    collateral: g.collateral ? String(g.collateral) : undefined,
    createdAt: g.createdAt ? Number(g.createdAt) : undefined,
    blocksElapsed:
      currentBlock && g.createdAt
        ? Math.max(0, currentBlock - Number(g.createdAt))
        : undefined,
  }));
}

function mapGotchiData(g: any, currentBlock: number | null): Gotchi {
  return {
    id: g.id,
    gotchiId:
      typeof g.id === "string"
        ? g.id.split("-").slice(-1)[0] || undefined
        : undefined,
    name: g.name || "Unnamed Gotchi",
    level: g.level ? Number(g.level) : undefined,
    numericTraits: Array.isArray(g.numericTraits)
      ? g.numericTraits.map((t: any) => Number(t) || 0)
      : [0, 0, 0, 0, 0, 0],
    modifiedNumericTraits: Array.isArray(g.modifiedNumericTraits)
      ? g.modifiedNumericTraits.map((t: any) => Number(t) || 0)
      : undefined,
    withSetsNumericTraits: Array.isArray(g.withSetsNumericTraits)
      ? g.withSetsNumericTraits.map((t: any) => Number(t) || 0)
      : undefined,
    equippedWearables: Array.isArray(g.equippedWearables)
      ? g.equippedWearables.map((w: any) => Number(w) || 0)
      : [0, 0, 0, 0, 0, 0, 0, 0],
    baseRarityScore: g.baseRarityScore ? Number(g.baseRarityScore) : null,
    usedSkillPoints: g.usedSkillPoints ? Number(g.usedSkillPoints) : undefined,
    hauntId: g.hauntId ? Number(g.hauntId) : undefined,
    collateral: g.collateral ? String(g.collateral) : undefined,
    createdAt: g.createdAt ? Number(g.createdAt) : undefined,
    blocksElapsed:
      currentBlock && g.createdAt
        ? Math.max(0, currentBlock - Number(g.createdAt))
        : undefined,
  };
}

export async function fetchGotchiByTokenId(tokenId: string): Promise<Gotchi | null> {
  const result = await client
    .query(GOTCHI_BY_TOKEN_ID, { tokenId })
    .toPromise();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const gotchis = result.data?.aavegotchis || [];
  if (gotchis.length === 0) return null;

  const currentBlock = Number(result.data?._meta?.block?.number) || null;
  return mapGotchiData(gotchis[0], currentBlock);
}

export async function searchGotchis(search: string, limit: number = 10): Promise<Gotchi[]> {
  if (!search.trim()) return [];

  const isNumeric = /^\d+$/.test(search.trim());

  if (isNumeric) {
    const gotchi = await fetchGotchiByTokenId(search.trim());
    return gotchi ? [gotchi] : [];
  }

  const result = await client
    .query(GOTCHIS_SEARCH, { search: search.trim(), first: limit })
    .toPromise();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const gotchis = result.data?.aavegotchis || [];
  const currentBlock = Number(result.data?._meta?.block?.number) || null;
  return gotchis.map((g: any) => mapGotchiData(g, currentBlock));
}

async function fetchAllWearablesFromSubgraph(): Promise<Wearable[]> {
  const all: Wearable[] = [];
  const pageSize = 1000;
  let skip = 0;

  while (true) {
    const result = await client
      .query(WEARABLES, { first: pageSize, skip })
      .toPromise();

    if (result.error) {
      throw new Error(result.error.message);
    }

    const items = result.data?.itemTypes || [];
    if (items.length === 0) break;

    for (const item of items) {
      all.push({
        id: Number(item.id),
        name: item.name || "Unknown",
        traitModifiers: Array.isArray(item.traitModifiers)
          ? item.traitModifiers.map((t: any) => Number(t) || 0)
          : [0, 0, 0, 0, 0, 0],
        slotPositions: Array.isArray(item.slotPositions)
          ? item.slotPositions.map(Boolean)
          : [],
        rarityScoreModifier: Number(item.rarityScoreModifier) || 0,
        category: Number(item.category) || 0,
      });
    }

    if (items.length < pageSize) break;
    skip += pageSize;
  }

  return all;
}

function getRarityFromModifier(modifier: number): string {
  if (modifier >= 50) return "Godlike";
  if (modifier >= 20) return "Mythical";
  if (modifier >= 10) return "Legendary";
  if (modifier >= 5) return "Rare";
  if (modifier >= 2) return "Uncommon";
  return "Common";
}

// Known-correct trait modifiers for wearables with subgraph data issues
// Format: { [wearableId]: [NRG, AGG, SPK, BRN, EYS, EYC] }
const WEARABLE_MODIFIER_PATCHES: Record<number, number[]> = {
  // Rofl pets - NRG and BRN only, no AGG/SPK
  151: [0, 0, 0, -1, 0, 0],      // Common Rofl: BRN -1
  152: [-1, 0, 0, -1, 0, 0],     // Uncommon Rofl: NRG -1, BRN -1
  153: [-1, 0, 0, -2, 0, 0],     // Rare Rofl: NRG -1, BRN -2
  154: [-2, 0, 0, -2, 0, 0],     // Legendary Rofl: NRG -2, BRN -2
  155: [-2, 0, 0, -3, 0, 0],     // Mythical Rofl: NRG -2, BRN -3
  156: [-3, 0, 0, -3, 0, 0],     // Godlike Rofl: NRG -3, BRN -3
};

export function applyWearablePatches(wearable: Wearable): Wearable {
  const patch = WEARABLE_MODIFIER_PATCHES[wearable.id];
  if (patch) {
    if (import.meta.env.DEV) {
      const current = wearable.traitModifiers?.slice(0, 4) || [];
      const expected = patch.slice(0, 4);
      const mismatch = current.some((v, i) => v !== expected[i]);
      if (mismatch) {
        console.warn(
          `[wearable-patch] ${wearable.name} (ID ${wearable.id}) modifiers corrected:`,
          { from: current, to: expected }
        );
      }
    }
    return { ...wearable, traitModifiers: patch };
  }
  return wearable;
}

// Apply patches to an array of wearables (useful for cached data)
export function applyAllWearablePatches(wearables: Wearable[]): Wearable[] {
  return wearables.map(applyWearablePatches);
}

export async function fetchAllWearables(): Promise<Wearable[]> {
  try {
    const remote = await fetchAllWearablesFromSubgraph();
    const local = wearablesData as Wearable[];
    const localById = new Map(local.map((w) => [Number(w.id), w]));

    return remote.map((item) => {
      const localItem = localById.get(Number(item.id));
      const merged = {
        ...localItem,
        ...item,
        traitModifiers: item.traitModifiers,
        slotPositions: item.slotPositions,
        rarityScoreModifier: item.rarityScoreModifier,
        rarity: getRarityFromModifier(item.rarityScoreModifier),
      } as Wearable;
      // Apply patches for known-incorrect subgraph data
      return applyWearablePatches(merged);
    });
  } catch {
    return (wearablesData as Wearable[]).map((w) => {
      const withRarity = {
        ...w,
        rarity: getRarityFromModifier(w.rarityScoreModifier || 0),
      };
      return applyWearablePatches(withRarity);
    });
  }
}

export async function fetchAllWearableSets(): Promise<WearableSet[]> {
  return wearableSetsData as WearableSet[];
}

