import type { ItemMeta } from "./itemMeta";

/**
 * Forge ERC1155 token-id scheme (Forge diamond, Base). Verified against
 * ForgeDiamond/libraries/LibAppStorage.sol in aavegotchi/aavegotchi-base:
 * schematic ids mirror wearable type ids exactly; everything else starts at
 * WEARABLE_GAP_OFFSET = 1e9. Cores are slot-major (Body, Face, Eyes, Head,
 * Hands, Pet), rarity-minor (Common → Godlike), 6 per slot from 1e9+8
 * (anchor: 1000000012 = Mythical Body Core, matches the live dapp).
 */
export const FORGE_ITEM_OFFSET = 1_000_000_000;

const RARITIES = ["Common", "Uncommon", "Rare", "Legendary", "Mythical", "Godlike"] as const;
const CORE_SLOTS = ["Body", "Face", "Eyes", "Head", "Hands", "Pet"] as const;

/** One-liners from the official wiki (posts/en/forge.md) — the dapp has no per-item copy. */
export const FORGE_DESCRIPTIONS: Record<string, string> = {
  alloy: "Alloy is the substance which forms all wearables in the Gotchiverse. It controls the overall supply of wearables.",
  essence: "Potent material from the hearts of sacrificed Aavegotchis. It takes Essence to forge new Godlike items and pets.",
  geode: "Crack a Geode open in the Forge for a chance at a prize — the rarer the Geode, the better the odds.",
  core: "Cores give a wearable its rarity-score boosting power. Each Core represents a rarity tier and a wearable slot.",
  schematic: "Schematics are the blueprints for each specific wearable — forge one with Alloy, a matching Core and GLTR.",
};

export type ForgeKind = "alloy" | "essence" | "geode" | "core" | "schematic";

export function forgeKind(id: number | string): ForgeKind | null {
  const n = Number(id);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < FORGE_ITEM_OFFSET) return "schematic";
  if (n === FORGE_ITEM_OFFSET) return "alloy";
  if (n === FORGE_ITEM_OFFSET + 1) return "essence";
  if (n <= FORGE_ITEM_OFFSET + 7) return "geode";
  if (n <= FORGE_ITEM_OFFSET + 43) return "core";
  return null;
}

/**
 * Display metadata for non-schematic forge tokens (ids ≥ 1e9): alloy, essence,
 * geodes and all 36 cores. Schematic ids are wearable ids — resolve those via
 * itemMetaSync/fetchItemMetaMap and suffix " Schematic" instead.
 */
export function forgeMetaSync(id: number | string): ItemMeta | undefined {
  const n = Number(id);
  if (n < FORGE_ITEM_OFFSET) return undefined;
  if (n === FORGE_ITEM_OFFSET) return { id: n, name: "Alloy", slot: null, modifiers: [], rarity: null, category: 0 };
  if (n === FORGE_ITEM_OFFSET + 1) return { id: n, name: "Essence", slot: null, modifiers: [], rarity: null, category: 0 };
  if (n <= FORGE_ITEM_OFFSET + 7) {
    const rarity = RARITIES[n - FORGE_ITEM_OFFSET - 2];
    return rarity ? { id: n, name: `${rarity} Geode`, slot: null, modifiers: [], rarity, category: 0 } : undefined;
  }
  if (n <= FORGE_ITEM_OFFSET + 43) {
    const offset = n - FORGE_ITEM_OFFSET - 8;
    const slot = CORE_SLOTS[Math.floor(offset / 6)];
    const rarity = RARITIES[offset % 6];
    return slot && rarity ? { id: n, name: `${rarity} ${slot} Core`, slot, modifiers: [], rarity, category: 0 } : undefined;
  }
  return undefined;
}
