import { CORE_SUBGRAPH } from "@/lib/subgraph";

export interface WearableMetadata {
  id: string;
  name: string;
  baseRarity: number;
  slotPositionsIndex: number[];
  rarityScoreModifier: number;
  traitModifiers: number[];
  svgId: string;
  totalQuantity: number;
}

const SLOT_NAMES: Record<number, string> = {
  0: "Head",
  1: "Face",
  2: "Eyes",
  3: "Body",
  4: "Left Hand",
  5: "Right Hand",
  6: "Neck",
  7: "Waist",
  8: "Feet",
  9: "Background",
  10: "Pet",
};

export function getSlotName(slotIndex: number): string {
  return SLOT_NAMES[slotIndex] || `Slot ${slotIndex}`;
}

export function getRarityColor(baseRarity: number): string {
  switch (baseRarity) {
    case 1:
      return "bg-gray-500/20 text-gray-400"; // Common
    case 2:
      return "bg-green-500/20 text-green-400"; // Uncommon
    case 3:
      return "bg-blue-500/20 text-blue-400"; // Rare
    case 4:
      return "bg-purple-500/20 text-purple-400"; // Epic
    case 5:
      return "bg-yellow-500/20 text-yellow-400"; // Mythical
    default:
      return "bg-muted/20 text-muted-foreground";
  }
}

export function getRarityLabel(baseRarity: number): string {
  switch (baseRarity) {
    case 1:
      return "Common";
    case 2:
      return "Uncommon";
    case 3:
      return "Rare";
    case 4:
      return "Epic";
    case 5:
      return "Mythical";
    default:
      return "Unknown";
  }
}

/**
 * Batch-fetch wearable metadata from the subgraph.
 * Fetches name, rarity, slot positions, and trait modifiers.
 */
export async function fetchWearableMetadata(wearableIds: string[]): Promise<Record<string, WearableMetadata>> {
  if (wearableIds.length === 0) return {};

  const idList = wearableIds.map((i) => `"${i}"`).join(",");
  const query = `{
    wearables(first: 1000, where: { id_in: [${idList}] }) {
      id
      name
      baseRarity
      slotPositionsIndex
      rarityScoreModifier
      traitModifiers
      svgId
      totalQuantity
    }
  }`;

  try {
    const res = await fetch(CORE_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");

    const out: Record<string, WearableMetadata> = {};
    for (const w of json.data?.wearables ?? []) {
      out[w.id] = {
        id: w.id,
        name: w.name || `Wearable #${w.id}`,
        baseRarity: Number(w.baseRarity) || 1,
        slotPositionsIndex: w.slotPositionsIndex ? (Array.isArray(w.slotPositionsIndex) ? w.slotPositionsIndex.map(Number) : [Number(w.slotPositionsIndex)]) : [],
        rarityScoreModifier: Number(w.rarityScoreModifier) || 0,
        traitModifiers: w.traitModifiers ? w.traitModifiers.map(Number) : [],
        svgId: w.svgId || "",
        totalQuantity: Number(w.totalQuantity) || 0,
      };
    }
    return out;
  } catch (err) {
    console.error("Failed to fetch wearable metadata:", err);
    return {};
  }
}

/**
 * Get a human-readable slot description for a wearable
 */
export function describeSlots(slots: number[]): string {
  if (slots.length === 0) return "Unknown slot";
  if (slots.length === 1) return getSlotName(slots[0]);
  return slots.map(getSlotName).join(" + ");
}
