import type { ExplorerGotchi, ExplorerSort } from "./types";

export function applySorts(
  gotchis: ExplorerGotchi[],
  sort: ExplorerSort
): ExplorerGotchi[] {
  const { field, direction } = sort;
  const mult = direction === "desc" ? -1 : 1;

  return [...gotchis].sort((a, b) => {
    let aVal: number;
    let bVal: number;

    // For price sorting, handle unlisted gotchis specially
    if (field === "price") {
      const aHasListing = !!a.listing;
      const bHasListing = !!b.listing;
      
      if (!aHasListing && !bHasListing) return 0;
      if (!aHasListing) return 1;
      if (!bHasListing) return -1;
      
      const aPrice = Number(BigInt(a.listing!.priceInWei) / BigInt(1e15));
      const bPrice = Number(BigInt(b.listing!.priceInWei) / BigInt(1e15));
      return (aPrice - bPrice) * mult;
    }

    // For listing time sorting
    if (field === "listingCreated") {
      const aHasListing = !!a.listing?.timeCreated;
      const bHasListing = !!b.listing?.timeCreated;
      
      if (!aHasListing && !bHasListing) return 0;
      if (!aHasListing) return 1;
      if (!bHasListing) return -1;
      
      const aTime = parseInt(a.listing!.timeCreated!, 10);
      const bTime = parseInt(b.listing!.timeCreated!, 10);
      return (aTime - bTime) * mult;
    }

    switch (field) {
      case "rarity":
        aVal = a.withSetsRarityScore || a.modifiedRarityScore || a.baseRarityScore;
        bVal = b.withSetsRarityScore || b.modifiedRarityScore || b.baseRarityScore;
        break;
      case "level":
        aVal = a.level;
        bVal = b.level;
        break;
      case "xp":
        aVal = a.experience || 0;
        bVal = b.experience || 0;
        break;
      case "tokenId":
        aVal = parseInt(a.tokenId, 10);
        bVal = parseInt(b.tokenId, 10);
        break;
      case "kinship":
        aVal = a.kinship || 0;
        bVal = b.kinship || 0;
        break;
      case "nrg":
        aVal = (a.withSetsNumericTraits || a.modifiedNumericTraits || a.numericTraits)[0] || 0;
        bVal = (b.withSetsNumericTraits || b.modifiedNumericTraits || b.numericTraits)[0] || 0;
        break;
      case "agg":
        aVal = (a.withSetsNumericTraits || a.modifiedNumericTraits || a.numericTraits)[1] || 0;
        bVal = (b.withSetsNumericTraits || b.modifiedNumericTraits || b.numericTraits)[1] || 0;
        break;
      case "spk":
        aVal = (a.withSetsNumericTraits || a.modifiedNumericTraits || a.numericTraits)[2] || 0;
        bVal = (b.withSetsNumericTraits || b.modifiedNumericTraits || b.numericTraits)[2] || 0;
        break;
      case "brn":
        aVal = (a.withSetsNumericTraits || a.modifiedNumericTraits || a.numericTraits)[3] || 0;
        bVal = (b.withSetsNumericTraits || b.modifiedNumericTraits || b.numericTraits)[3] || 0;
        break;
      default:
        aVal = parseInt(a.tokenId, 10);
        bVal = parseInt(b.tokenId, 10);
    }

    return (aVal - bVal) * mult;
  });
}

export type SortOption = {
  value: ExplorerSort;
  label: string;
  shortLabel: string;
  category: "stats" | "traits" | "market";
};

export const sortOptions: SortOption[] = [
  // Stats
  { value: { field: "rarity", direction: "desc" }, label: "Highest Rarity", shortLabel: "Rarity", category: "stats" },
  { value: { field: "rarity", direction: "asc" }, label: "Lowest Rarity", shortLabel: "Rarity", category: "stats" },
  { value: { field: "level", direction: "desc" }, label: "Highest Level", shortLabel: "Level", category: "stats" },
  { value: { field: "level", direction: "asc" }, label: "Lowest Level", shortLabel: "Level", category: "stats" },
  { value: { field: "kinship", direction: "desc" }, label: "Most Kinship", shortLabel: "Kinship", category: "stats" },
  { value: { field: "kinship", direction: "asc" }, label: "Least Kinship", shortLabel: "Kinship", category: "stats" },
  { value: { field: "xp", direction: "desc" }, label: "Most XP", shortLabel: "XP", category: "stats" },
  { value: { field: "xp", direction: "asc" }, label: "Least XP", shortLabel: "XP", category: "stats" },
  { value: { field: "tokenId", direction: "asc" }, label: "Oldest (Token ID)", shortLabel: "ID", category: "stats" },
  { value: { field: "tokenId", direction: "desc" }, label: "Newest (Token ID)", shortLabel: "ID", category: "stats" },
  // Traits
  { value: { field: "nrg", direction: "desc" }, label: "Highest NRG", shortLabel: "NRG", category: "traits" },
  { value: { field: "nrg", direction: "asc" }, label: "Lowest NRG", shortLabel: "NRG", category: "traits" },
  { value: { field: "agg", direction: "desc" }, label: "Highest AGG", shortLabel: "AGG", category: "traits" },
  { value: { field: "agg", direction: "asc" }, label: "Lowest AGG", shortLabel: "AGG", category: "traits" },
  { value: { field: "spk", direction: "desc" }, label: "Highest SPK", shortLabel: "SPK", category: "traits" },
  { value: { field: "spk", direction: "asc" }, label: "Lowest SPK", shortLabel: "SPK", category: "traits" },
  { value: { field: "brn", direction: "desc" }, label: "Highest BRN", shortLabel: "BRN", category: "traits" },
  { value: { field: "brn", direction: "asc" }, label: "Lowest BRN", shortLabel: "BRN", category: "traits" },
  // Market
  { value: { field: "listingCreated", direction: "desc" }, label: "Newest Listing", shortLabel: "Listed", category: "market" },
  { value: { field: "listingCreated", direction: "asc" }, label: "Oldest Listing", shortLabel: "Listed", category: "market" },
  { value: { field: "price", direction: "asc" }, label: "Lowest Price", shortLabel: "Price", category: "market" },
  { value: { field: "price", direction: "desc" }, label: "Highest Price", shortLabel: "Price", category: "market" },
];

export const defaultBaazaarSort: ExplorerSort = { field: "listingCreated", direction: "desc" };

export function getSortLabel(sort: ExplorerSort): string {
  const opt = sortOptions.find(
    (o) => o.value.field === sort.field && o.value.direction === sort.direction
  );
  return opt?.label || "Sort";
}
