export type AssetType = "gotchi" | "wearable";

export type WearableSortField =
  | "name"
  | "id"
  | "rarity"
  | "slot"
  | "totalStats"
  | "quantity"
  | "price";

export type WearableSort = {
  field: WearableSortField;
  direction: "asc" | "desc";
};

export type WearableExplorerFilters = {
  search: string;
  slots: number[];
  rarityTiers: string[];
  sets: string[];
  nrgMin: string;
  nrgMax: string;
  aggMin: string;
  aggMax: string;
  spkMin: string;
  spkMax: string;
  brnMin: string;
  brnMax: string;
  positiveModsOnly: boolean;
  negativeModsOnly: boolean;
  quantityMin: string;
  quantityMax: string;
  priceMin: string;
  priceMax: string;
  hasSetBonus: boolean | null;
  statModifyingOnly: boolean | null;
};

export const defaultWearableFilters: WearableExplorerFilters = {
  search: "",
  slots: [],
  rarityTiers: [],
  sets: [],
  nrgMin: "",
  nrgMax: "",
  aggMin: "",
  aggMax: "",
  spkMin: "",
  spkMax: "",
  brnMin: "",
  brnMax: "",
  positiveModsOnly: false,
  negativeModsOnly: false,
  quantityMin: "",
  quantityMax: "",
  priceMin: "",
  priceMax: "",
  hasSetBonus: null,
  statModifyingOnly: null,
};

export const defaultWearableSort: WearableSort = {
  field: "rarity",
  direction: "desc",
};

export type ExplorerWearable = {
  id: number;
  name: string;
  traitModifiers: number[];
  slotPositions: boolean[];
  rarityScoreModifier: number;
  category: number;
  slots: number[];
  rarity: string;
  setIds: string[];
  quantity?: number;
  price?: number;
  listing?: {
    id: string;
    priceInWei: string;
    timeCreated: string;
  };
};

export const SLOT_NAMES_EXPLORER = [
  "Body",
  "Face",
  "Eyes",
  "Head",
  "Hand L",
  "Hand R",
  "Pet",
  "Background",
];

export const RARITY_TIERS = [
  { name: "Godlike", minBRS: 50 },
  { name: "Mythical", minBRS: 20 },
  { name: "Legendary", minBRS: 10 },
  { name: "Rare", minBRS: 5 },
  { name: "Uncommon", minBRS: 2 },
  { name: "Common", minBRS: 1 },
];

export function getWearableRarityTier(rarityScoreModifier: number): string {
  for (const tier of RARITY_TIERS) {
    if (rarityScoreModifier >= tier.minBRS) return tier.name;
  }
  return "Common";
}

export function getSlotName(slotIndex: number): string {
  return SLOT_NAMES_EXPLORER[slotIndex] || `Slot ${slotIndex}`;
}

export function getWearableSlots(slotPositions: boolean[]): number[] {
  return slotPositions
    .map((occupied, index) => (occupied ? index : -1))
    .filter((index) => index >= 0);
}
