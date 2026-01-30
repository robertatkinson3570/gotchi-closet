export type DataMode = "mine" | "all" | "baazaar" | "auction";

export type SortField =
  | "rarity"
  | "kinship"
  | "level"
  | "xp"
  | "tokenId"
  | "price"
  | "listingCreated"
  | "nrg"
  | "agg"
  | "spk"
  | "brn";

export type SortDirection = "asc" | "desc";

export type ExplorerSort = {
  field: SortField;
  direction: SortDirection;
};

export type ExplorerFilters = {
  tokenId: string;
  tokenIdMin: string;
  tokenIdMax: string;
  nameContains: string;
  ownerAddress: string;
  rarityMin: string;
  rarityMax: string;
  rarityTiers: string[];
  nrgMin: string;
  nrgMax: string;
  aggMin: string;
  aggMax: string;
  spkMin: string;
  spkMax: string;
  brnMin: string;
  brnMax: string;
  extremeTraits: boolean;
  balancedTraits: boolean;
  levelMin: string;
  levelMax: string;
  hasWearables: boolean | null;
  wearableCountMin: string;
  wearableCountMax: string;
  haunts: string[];
  priceMin: string;
  priceMax: string;
  hasGhstPocket: boolean | null;
  ghstBalanceMin: string;
  ghstBalanceMax: string;
  hasEquippedSet: boolean | null;
  equippedSets: string[];
  doubleMythEyes: boolean;
};

export const defaultFilters: ExplorerFilters = {
  tokenId: "",
  tokenIdMin: "",
  tokenIdMax: "",
  nameContains: "",
  ownerAddress: "",
  rarityMin: "",
  rarityMax: "",
  rarityTiers: [],
  nrgMin: "",
  nrgMax: "",
  aggMin: "",
  aggMax: "",
  spkMin: "",
  spkMax: "",
  brnMin: "",
  brnMax: "",
  extremeTraits: false,
  balancedTraits: false,
  levelMin: "",
  levelMax: "",
  hasWearables: null,
  wearableCountMin: "",
  wearableCountMax: "",
  haunts: [],
  priceMin: "",
  priceMax: "",
  hasGhstPocket: null,
  ghstBalanceMin: "",
  ghstBalanceMax: "",
  hasEquippedSet: null,
  equippedSets: [],
  doubleMythEyes: false,
};

export type ExplorerGotchi = {
  id: string;
  tokenId: string;
  name: string;
  hauntId: number;
  level: number;
  baseRarityScore: number;
  modifiedRarityScore: number;
  withSetsRarityScore: number;
  numericTraits: number[];
  modifiedNumericTraits: number[];
  withSetsNumericTraits: number[];
  equippedWearables: number[];
  collateral: string;
  owner: string;
  kinship?: number;
  experience?: number;
  listing?: {
    id: string;
    priceInWei: string;
    timeCreated?: string;
    seller?: string;
  };
  escrow?: string;
  createdAt?: number;
  usedSkillPoints?: number;
  equippedSetID?: number;
  equippedSetName?: string;
  lastInteracted?: number;
  minimumStake?: string;
  stakedAmount?: string;
};
