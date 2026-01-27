export type Gotchi = {
  id: string;
  gotchiId?: string;
  name: string;
  level?: number;
  numericTraits: number[];
  baseNumericTraits?: number[];
  modifiedNumericTraits?: number[];
  withSetsNumericTraits?: number[];
  equippedWearables: number[];
  baseRarityScore?: number | null;
  usedSkillPoints?: number;
  hauntId?: number;
  collateral?: string;
  createdAt?: number;
  blocksElapsed?: number;
};

export type Wearable = {
  id: number;
  name: string;
  traitModifiers: number[];
  slotPositions: boolean[];
  rarityScoreModifier: number;
  category: number;
  slots?: number[];
  handPlacement?: "left" | "right" | "either" | "none";
  rarity?: string;
  setIds?: string[];
};

export type WearableSet = {
  id: string;
  name: string;
  wearableIds: number[];
  traitBonuses: number[];
  setBonusBRS?: number;
};

export type EditorState = {
  baseGotchi: Gotchi;
  equippedBySlot: number[]; // length 8, wearable id or 0
};

export type EditorInstance = {
  instanceId: string;
  baseGotchi: Gotchi;
  equippedBySlot: number[];
};

export type WearableMode = "all" | "owned" | "baazaar";

export type WearableFilters = {
  search: string;
  slot: number | null; // 0-7 or null
  rarity: string | null; // rarity tier or null
  set: string | null; // set id or null
  showMissingOnly: boolean;
  traitDirections: number[] | null; // [NRG, AGG, SPK, BRN] direction: -1 (low), 0 (neutral), 1 (high)
  ownedOnly: boolean; // Show only wearables owned by loaded gotchis (legacy, use wearableMode)
  wearableMode: WearableMode; // "all" | "owned" | "baazaar"
};

