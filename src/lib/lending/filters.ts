import {
  BRS_BANDS,
  DURATION_BUCKETS,
  brsBandOf,
  durationBucketOf,
} from "./types";
import type { Lending, LendingFilters, LendingSort } from "./types";
import { ghstFromWei } from "./transform";

export function applyLendingFilters(
  lendings: Lending[],
  f: LendingFilters,
  rentableWhitelistIds: Set<string> | null = null
): Lending[] {
  const search = f.search.trim().toLowerCase();
  const isAddress = /^0x[a-f0-9]{40}$/.test(search);
  const priceMinNum = f.priceMin ? Number(f.priceMin) : null;
  const priceMaxNum = f.priceMax ? Number(f.priceMax) : null;
  const splitMinNum = f.borrowerSplitMin ? Number(f.borrowerSplitMin) : null;

  return lendings.filter((l) => {
    if (search) {
      if (isAddress) {
        if (l.lender.toLowerCase() !== search && l.originalOwner.toLowerCase() !== search) {
          return false;
        }
      } else {
        const name = l.gotchi?.name?.toLowerCase() ?? "";
        if (
          !l.gotchiTokenId.includes(search) &&
          !name.includes(search)
        ) {
          return false;
        }
      }
    }

    if (f.brsBands.length > 0) {
      const band = brsBandOf(l.gotchiBRS);
      if (!f.brsBands.includes(band)) return false;
    }

    if (f.durationBuckets.length > 0) {
      const bucket = durationBucketOf(l.period);
      if (!f.durationBuckets.includes(bucket)) return false;
    }

    if (priceMinNum !== null || priceMaxNum !== null) {
      const ghst = ghstFromWei(l.upfrontCost);
      if (priceMinNum !== null && ghst < priceMinNum) return false;
      if (priceMaxNum !== null && ghst > priceMaxNum) return false;
    }

    if (f.whitelist === "open") {
      if (l.whitelistId && l.whitelistId !== "0") return false;
    } else if (f.whitelist === "whitelisted") {
      if (!l.whitelistId || l.whitelistId === "0") return false;
    } else if (f.whitelist === "rentable_by_me") {
      const isOpen = !l.whitelistId || l.whitelistId === "0";
      if (!isOpen) {
        if (!rentableWhitelistIds || !rentableWhitelistIds.has(l.whitelistId!)) {
          return false;
        }
      }
    }

    if (f.channelling === "yes" && !l.channellingAllowed) return false;
    if (f.channelling === "no" && l.channellingAllowed) return false;

    if (splitMinNum !== null && l.splitBorrower < splitMinNum) return false;

    return true;
  });
}

export function applyLendingSort(
  lendings: Lending[],
  sort: LendingSort
): Lending[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  const sorted = [...lendings];
  sorted.sort((a, b) => {
    let av = 0;
    let bv = 0;
    switch (sort.field) {
      case "newest":
        av = a.timeCreated;
        bv = b.timeCreated;
        break;
      case "price":
        av = ghstFromWei(a.upfrontCost);
        bv = ghstFromWei(b.upfrontCost);
        break;
      case "brs":
        av = a.gotchiBRS;
        bv = b.gotchiBRS;
        break;
      case "duration":
        av = a.period;
        bv = b.period;
        break;
      case "level":
        av = a.gotchi?.level ?? 0;
        bv = b.gotchi?.level ?? 0;
        break;
      case "kinship":
        av = a.gotchi?.kinship ?? 0;
        bv = b.gotchi?.kinship ?? 0;
        break;
    }
    return (av - bv) * dir;
  });
  return sorted;
}

export function getActiveLendingFilterCount(f: LendingFilters): number {
  let n = 0;
  if (f.search.trim()) n += 1;
  if (f.brsBands.length) n += 1;
  if (f.durationBuckets.length) n += 1;
  if (f.priceMin || f.priceMax) n += 1;
  if (f.whitelist !== "any") n += 1;
  if (f.channelling !== "any") n += 1;
  if (f.borrowerSplitMin) n += 1;
  return n;
}

export const ALL_BRS_BAND_LABELS = BRS_BANDS.map((b) => b.label);
export const ALL_DURATION_LABELS = DURATION_BUCKETS.map((b) => b.label);
