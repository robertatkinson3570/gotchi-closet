import wearablesData from "../../../data/wearables.json";
import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";
import { getSlotName, getWearableRarityTier, getWearableSlots } from "./wearableTypes";

/** Display metadata for any Baazaar ERC1155 type id (wearable / consumable / schematic). */
export type ItemMeta = {
  id: number;
  name: string;
  /** First equippable slot label ("Body", "Hand L", …); null = no slot (consumable). */
  slot: string | null;
  /** Non-zero trait modifiers, e.g. ["NRG -1", "AGG -2"]. */
  modifiers: string[];
  /** Rarity tier name; null for consumables (itemType category 2). */
  rarity: string | null;
  /** itemType category: 0 wearable, 2 consumable. */
  category: number;
};

const TRAIT_KEYS = ["NRG", "AGG", "SPK", "BRN", "EYS", "EYC"];

// Canonical rarity tints (moved from WearableExplorerCard so auctions/activity share them).
export const RARITY_COLORS: Record<string, string> = {
  Godlike: "text-cyan-400",
  Mythical: "text-pink-400",
  Legendary: "text-yellow-400",
  Rare: "text-blue-400",
  Uncommon: "text-green-400",
  Common: "text-gray-400",
};

export const RARITY_BG: Record<string, string> = {
  Godlike: "bg-cyan-500/20 border-cyan-500/40",
  Mythical: "bg-pink-500/20 border-pink-500/40",
  Legendary: "bg-yellow-500/20 border-yellow-500/40",
  Rare: "bg-blue-500/20 border-blue-500/40",
  Uncommon: "bg-green-500/20 border-green-500/40",
  Common: "bg-gray-500/20 border-gray-500/40",
};

export function formatModifiers(traitModifiers: unknown[]): string[] {
  return (traitModifiers ?? [])
    .map((v, i) => ({ v: Number(v) || 0, k: TRAIT_KEYS[i] }))
    .filter((x) => x.v !== 0 && x.k)
    .map((x) => `${x.k} ${x.v > 0 ? "+" : ""}${x.v}`);
}

type RawItemType = {
  id: number | string;
  name?: string;
  category?: number | string;
  rarityScoreModifier?: number | string;
  traitModifiers?: unknown[];
  slotPositions?: unknown[];
};

function toMeta(raw: RawItemType): ItemMeta {
  const cat = Number(raw.category) || 0;
  const slots = getWearableSlots((raw.slotPositions ?? []).map(Boolean));
  return {
    id: Number(raw.id),
    name: raw.name || `#${raw.id}`,
    slot: slots.length > 0 ? getSlotName(slots[0]) : null,
    modifiers: formatModifiers(raw.traitModifiers ?? []),
    rarity: cat === 0 ? getWearableRarityTier(Number(raw.rarityScoreModifier) || 0) : null,
    category: cat,
  };
}

const localMeta = new Map<number, ItemMeta>(
  (wearablesData as RawItemType[]).map((w) => [Number(w.id), toMeta(w)])
);

/** Synchronous lookup from the bundled wearables db (covers all wearables, not consumables). */
export function itemMetaSync(id: number | string): ItemMeta | undefined {
  return localMeta.get(Number(id));
}

// Guardian skin names by ERC1155 type id. No on-chain/subgraph name source
// exists; mapping verified 2026-07-02 by aligning our category-12 listing
// order (typeId + price + qty) 1:1 against the names the dapp renders for
// the same listings. Unknown ids fall back to a generic label.
export const GUARDIAN_SKIN_NAMES: Record<number, string> = {
  3: "Ghost Pirate",
  4: "Snowman Brute Force Skin",
  5: "Winter Prong Meadow Skin",
  6: "Winter Rofl Skin",
  7: "Cupid Aarcher",
};

let remote: Promise<Map<number, ItemMeta>> | null = null;

/** Bundled db merged with subgraph itemTypes (adds consumables); cached for the session. */
export function fetchItemMetaMap(): Promise<Map<number, ItemMeta>> {
  if (!remote) {
    remote = (async () => {
      const map = new Map(localMeta);
      try {
        const res = await coreSubgraphFetch(CORE_SUBGRAPH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `{ itemTypes(first: 1000) { id name category rarityScoreModifier traitModifiers slotPositions } }`,
          }),
        });
        const json = await res.json();
        for (const it of json?.data?.itemTypes ?? []) {
          const meta = toMeta(it);
          if (meta.name && !meta.name.startsWith("#")) map.set(meta.id, meta);
        }
      } catch {
        /* offline → bundled data only */
      }
      return map;
    })();
  }
  return remote;
}
