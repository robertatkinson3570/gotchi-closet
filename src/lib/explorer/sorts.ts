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
      case "price":
        aVal = a.listing ? Number(BigInt(a.listing.priceInWei) / BigInt(1e15)) : Infinity;
        bVal = b.listing ? Number(BigInt(b.listing.priceInWei) / BigInt(1e15)) : Infinity;
        break;
      case "kinship":
        aVal = a.kinship || 0;
        bVal = b.kinship || 0;
        break;
      case "xp":
        aVal = a.experience || 0;
        bVal = b.experience || 0;
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

export const sortOptions: { value: ExplorerSort; label: string }[] = [
  { value: { field: "rarity", direction: "desc" }, label: "Rarity Score ↓" },
  { value: { field: "rarity", direction: "asc" }, label: "Rarity Score ↑" },
  { value: { field: "level", direction: "desc" }, label: "Level ↓" },
  { value: { field: "level", direction: "asc" }, label: "Level ↑" },
  { value: { field: "kinship", direction: "desc" }, label: "Kinship ↓" },
  { value: { field: "kinship", direction: "asc" }, label: "Kinship ↑" },
  { value: { field: "tokenId", direction: "asc" }, label: "Token ID ↑" },
  { value: { field: "tokenId", direction: "desc" }, label: "Token ID ↓" },
  { value: { field: "nrg", direction: "desc" }, label: "NRG ↓" },
  { value: { field: "nrg", direction: "asc" }, label: "NRG ↑" },
  { value: { field: "agg", direction: "desc" }, label: "AGG ↓" },
  { value: { field: "agg", direction: "asc" }, label: "AGG ↑" },
  { value: { field: "spk", direction: "desc" }, label: "SPK ↓" },
  { value: { field: "spk", direction: "asc" }, label: "SPK ↑" },
  { value: { field: "brn", direction: "desc" }, label: "BRN ↓" },
  { value: { field: "brn", direction: "asc" }, label: "BRN ↑" },
  { value: { field: "price", direction: "asc" }, label: "Price ↑" },
  { value: { field: "price", direction: "desc" }, label: "Price ↓" },
];
