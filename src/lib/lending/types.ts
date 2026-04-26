export type Lending = {
  id: string;
  gotchiTokenId: string;
  gotchiBRS: number;
  period: number; // seconds
  upfrontCost: string; // wei string
  splitOwner: number;
  splitBorrower: number;
  splitOther: number;
  whitelistId: string | null;
  whitelistName: string | null;
  thirdPartyAddress: string | null;
  lender: string;
  originalOwner: string;
  channellingAllowed: boolean;
  timeCreated: number;
  gotchi: {
    id: string;
    name: string | null;
    hauntId: number;
    level: number;
    baseRarityScore: number;
    modifiedRarityScore: number;
    withSetsRarityScore: number;
    kinship: number;
    collateral: string;
    numericTraits: number[];
    modifiedNumericTraits: number[];
    withSetsNumericTraits: number[];
    equippedWearables: number[];
  } | null;
};

export type LendingSortField =
  | "newest"
  | "price"
  | "brs"
  | "duration"
  | "level"
  | "kinship";

export type SortDirection = "asc" | "desc";

export type LendingSort = {
  field: LendingSortField;
  direction: SortDirection;
};

export const defaultLendingSort: LendingSort = {
  field: "newest",
  direction: "desc",
};

export type WhitelistMode = "any" | "open" | "whitelisted" | "rentable_by_me";
export type ChannellingMode = "any" | "yes" | "no";
export type DurationUnit = "hours" | "days";

export type LendingFilters = {
  search: string; // gotchi id, name, owner addr
  brsBands: string[]; // band labels
  durationBuckets: string[];
  priceMin: string;
  priceMax: string;
  whitelist: WhitelistMode;
  whitelistId: string; // exact whitelist id, e.g. "1234"; "" = no constraint
  channelling: ChannellingMode;
  borrowerSplitMin: string; // % min
  durationMinValue: string; // numeric string; empty = no constraint
  durationMinUnit: DurationUnit;
  kinshipMin: string; // numeric string; empty = no constraint
  haunts: string[]; // ["1","2","3","4"]; empty = all
};

export const defaultLendingFilters: LendingFilters = {
  search: "",
  brsBands: [],
  durationBuckets: [],
  priceMin: "",
  priceMax: "",
  whitelist: "any",
  whitelistId: "",
  channelling: "any",
  borrowerSplitMin: "",
  durationMinValue: "",
  durationMinUnit: "days",
  kinshipMin: "",
  haunts: [],
};

export const BRS_BANDS = [
  { label: "<500", min: 0, max: 500 },
  { label: "500-529", min: 500, max: 530 },
  { label: "530-569", min: 530, max: 570 },
  { label: "570-599", min: 570, max: 600 },
  { label: "600-629", min: 600, max: 630 },
  { label: "630-659", min: 630, max: 660 },
  { label: "660-699", min: 660, max: 700 },
  { label: "700+", min: 700, max: Infinity },
] as const;

export const DURATION_BUCKETS = [
  { label: "≤1d", maxSec: 86400 + 100 },
  { label: "2-3d", maxSec: 3 * 86400 + 100 },
  { label: "4-7d", maxSec: 7 * 86400 + 100 },
  { label: "8-14d", maxSec: 14 * 86400 + 100 },
  { label: "15-31d", maxSec: 31 * 86400 + 100 },
  { label: ">31d", maxSec: Infinity },
] as const;

export function brsBandOf(brs: number): string {
  for (const b of BRS_BANDS) {
    if (brs >= b.min && brs < b.max) return b.label;
  }
  return "<500";
}

export function durationBucketOf(seconds: number): string {
  let prev = 0;
  for (const b of DURATION_BUCKETS) {
    if (seconds <= b.maxSec) return b.label;
    prev = b.maxSec;
  }
  void prev;
  return ">31d";
}
