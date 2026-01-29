import type { ExplorerFilters, ExplorerGotchi } from "./types";

export function applyFilters(
  gotchis: ExplorerGotchi[],
  filters: ExplorerFilters
): ExplorerGotchi[] {
  return gotchis.filter((g) => {
    if (filters.tokenId && g.tokenId !== filters.tokenId) return false;
    
    if (filters.tokenIdMin) {
      const min = parseInt(filters.tokenIdMin, 10);
      if (!isNaN(min) && parseInt(g.tokenId, 10) < min) return false;
    }
    if (filters.tokenIdMax) {
      const max = parseInt(filters.tokenIdMax, 10);
      if (!isNaN(max) && parseInt(g.tokenId, 10) > max) return false;
    }

    if (filters.nameContains) {
      const search = filters.nameContains.toLowerCase();
      if (!g.name.toLowerCase().includes(search)) return false;
    }

    if (filters.rarityMin) {
      const min = parseInt(filters.rarityMin, 10);
      if (!isNaN(min) && g.withSetsRarityScore < min) return false;
    }
    if (filters.rarityMax) {
      const max = parseInt(filters.rarityMax, 10);
      if (!isNaN(max) && g.withSetsRarityScore > max) return false;
    }

    if (filters.rarityTiers.length > 0) {
      const tier = getRarityTier(g.withSetsRarityScore);
      if (!filters.rarityTiers.includes(tier)) return false;
    }

    const traits = g.withSetsNumericTraits || g.modifiedNumericTraits || g.numericTraits;
    if (traits.length >= 4) {
      if (filters.nrgMin && traits[0] < parseInt(filters.nrgMin, 10)) return false;
      if (filters.nrgMax && traits[0] > parseInt(filters.nrgMax, 10)) return false;
      if (filters.aggMin && traits[1] < parseInt(filters.aggMin, 10)) return false;
      if (filters.aggMax && traits[1] > parseInt(filters.aggMax, 10)) return false;
      if (filters.spkMin && traits[2] < parseInt(filters.spkMin, 10)) return false;
      if (filters.spkMax && traits[2] > parseInt(filters.spkMax, 10)) return false;
      if (filters.brnMin && traits[3] < parseInt(filters.brnMin, 10)) return false;
      if (filters.brnMax && traits[3] > parseInt(filters.brnMax, 10)) return false;

      if (filters.extremeTraits) {
        const hasExtreme = traits.slice(0, 4).some((t) => t <= 10 || t >= 90);
        if (!hasExtreme) return false;
      }
      if (filters.balancedTraits) {
        const isBalanced = traits.slice(0, 4).every((t) => t >= 40 && t <= 60);
        if (!isBalanced) return false;
      }
    }

    if (filters.levelMin) {
      const min = parseInt(filters.levelMin, 10);
      if (!isNaN(min) && g.level < min) return false;
    }
    if (filters.levelMax) {
      const max = parseInt(filters.levelMax, 10);
      if (!isNaN(max) && g.level > max) return false;
    }

    if (filters.hasWearables === true) {
      const hasAny = g.equippedWearables.some((w) => Number(w) > 0);
      if (!hasAny) return false;
    }
    if (filters.hasWearables === false) {
      const hasAny = g.equippedWearables.some((w) => Number(w) > 0);
      if (hasAny) return false;
    }

    if (filters.wearableCountMin) {
      const min = parseInt(filters.wearableCountMin, 10);
      const count = g.equippedWearables.filter((w) => Number(w) > 0).length;
      if (!isNaN(min) && count < min) return false;
    }
    if (filters.wearableCountMax) {
      const max = parseInt(filters.wearableCountMax, 10);
      const count = g.equippedWearables.filter((w) => Number(w) > 0).length;
      if (!isNaN(max) && count > max) return false;
    }

    if (filters.haunts && filters.haunts.length > 0) {
      if (!filters.haunts.includes(String(g.hauntId))) return false;
    }

    if (filters.priceMin && g.listing) {
      const min = parseFloat(filters.priceMin);
      const price = parseFloat(g.listing.priceInWei) / 1e18;
      if (!isNaN(min) && price < min) return false;
    }
    if (filters.priceMax && g.listing) {
      const max = parseFloat(filters.priceMax);
      const price = parseFloat(g.listing.priceInWei) / 1e18;
      if (!isNaN(max) && price > max) return false;
    }

    if (filters.hasGhstPocket === true) {
      const stakedBalance = parseFloat(g.stakedAmount || "0");
      if (stakedBalance <= 0) return false;
    }
    if (filters.hasGhstPocket === false) {
      const stakedBalance = parseFloat(g.stakedAmount || "0");
      if (stakedBalance > 0) return false;
    }

    if (filters.ghstBalanceMin) {
      const min = parseFloat(filters.ghstBalanceMin);
      const balance = parseFloat(g.stakedAmount || "0") / 1e18;
      if (!isNaN(min) && balance < min) return false;
    }
    if (filters.ghstBalanceMax) {
      const max = parseFloat(filters.ghstBalanceMax);
      const balance = parseFloat(g.stakedAmount || "0") / 1e18;
      if (!isNaN(max) && balance > max) return false;
    }

    if (filters.hasEquippedSet === true) {
      if (!g.equippedSetID || g.equippedSetID === 0) return false;
    }
    if (filters.hasEquippedSet === false) {
      if (g.equippedSetID && g.equippedSetID > 0) return false;
    }

    if (filters.equippedSets.length > 0) {
      if (!g.equippedSetName || !filters.equippedSets.includes(g.equippedSetName)) return false;
    }

    if (filters.doubleMythEyes) {
      const traits = g.withSetsNumericTraits || g.modifiedNumericTraits || g.numericTraits;
      if (traits.length >= 6) {
        const eyeShape = traits[4];
        const eyeColor = traits[5];
        const isMythShape = eyeShape <= 1 || eyeShape >= 98;
        const isMythColor = eyeColor <= 1 || eyeColor >= 98;
        if (!isMythShape || !isMythColor) return false;
      } else {
        return false;
      }
    }

    return true;
  });
}

export function getRarityTier(score: number): string {
  if (score >= 700) return "godlike";
  if (score >= 600) return "mythical";
  if (score >= 500) return "legendary";
  if (score >= 450) return "rare";
  if (score >= 400) return "uncommon";
  return "common";
}

export function getActiveFilterCount(filters: ExplorerFilters): number {
  let count = 0;
  if (filters.tokenId) count++;
  if (filters.tokenIdMin || filters.tokenIdMax) count++;
  if (filters.nameContains) count++;
  if (filters.rarityMin || filters.rarityMax) count++;
  if (filters.rarityTiers.length > 0) count++;
  if (filters.nrgMin || filters.nrgMax) count++;
  if (filters.aggMin || filters.aggMax) count++;
  if (filters.spkMin || filters.spkMax) count++;
  if (filters.brnMin || filters.brnMax) count++;
  if (filters.extremeTraits) count++;
  if (filters.balancedTraits) count++;
  if (filters.levelMin || filters.levelMax) count++;
  if (filters.hasWearables !== null) count++;
  if (filters.wearableCountMin || filters.wearableCountMax) count++;
  if (filters.haunts && filters.haunts.length > 0) count++;
  if (filters.priceMin || filters.priceMax) count++;
  if (filters.hasGhstPocket !== null) count++;
  if (filters.ghstBalanceMin || filters.ghstBalanceMax) count++;
  if (filters.hasEquippedSet !== null) count++;
  if (filters.equippedSets && filters.equippedSets.length > 0) count++;
  if (filters.doubleMythEyes) count++;
  return count;
}
