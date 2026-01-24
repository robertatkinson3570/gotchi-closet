import { client } from "./client";
import { GOTCHIS_BY_OWNER, WEARABLES } from "./queries";
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
    hauntId: g.hauntId ? Number(g.hauntId) : undefined,
    collateral: g.collateral ? String(g.collateral) : undefined,
    createdAt: g.createdAt ? Number(g.createdAt) : undefined,
    blocksElapsed:
      currentBlock && g.createdAt
        ? Math.max(0, currentBlock - Number(g.createdAt))
        : undefined,
  }));
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

export async function fetchAllWearables(): Promise<Wearable[]> {
  try {
    const remote = await fetchAllWearablesFromSubgraph();
    const local = wearablesData as Wearable[];
    const localById = new Map(local.map((w) => [Number(w.id), w]));

    return remote.map((item) => {
      const localItem = localById.get(Number(item.id));
      return {
        ...localItem,
        ...item,
        traitModifiers: item.traitModifiers,
        slotPositions: item.slotPositions,
        rarityScoreModifier: item.rarityScoreModifier,
      } as Wearable;
    });
  } catch {
    return wearablesData as Wearable[];
  }
}

export async function fetchAllWearableSets(): Promise<WearableSet[]> {
  return wearableSetsData as WearableSet[];
}

