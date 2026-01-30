import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "@/state/useAppStore";
import { useBaazaar } from "@/hooks/useBaazaar";
import { computeOwnedCounts } from "@/state/selectors";
import type { DataMode } from "@/lib/explorer/types";
import type {
  ExplorerWearable,
  WearableExplorerFilters,
  WearableSort,
} from "@/lib/explorer/wearableTypes";
import {
  defaultWearableFilters,
  defaultWearableSort,
  getWearableRarityTier,
  getWearableSlots,
} from "@/lib/explorer/wearableTypes";
import type { Wearable } from "@/types";

const PAGE_SIZE = 100;

function wearableToExplorer(w: Wearable): ExplorerWearable {
  return {
    id: w.id,
    name: w.name,
    traitModifiers: w.traitModifiers,
    slotPositions: w.slotPositions,
    rarityScoreModifier: w.rarityScoreModifier,
    category: w.category,
    slots: w.slots || getWearableSlots(w.slotPositions),
    rarity: w.rarity || getWearableRarityTier(w.rarityScoreModifier),
    setIds: w.setIds || [],
  };
}

function applyFilters(
  wearables: ExplorerWearable[],
  filters: WearableExplorerFilters,
  ownedCounts: Record<number, number>,
  pricesMap: Record<number, string>,
  mode: DataMode
): ExplorerWearable[] {
  return wearables.filter((w) => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesName = w.name.toLowerCase().includes(searchLower);
      const matchesId = String(w.id) === filters.search;
      if (!matchesName && !matchesId) return false;
    }

    if (filters.slots.length > 0) {
      const wearableSlots = w.slots;
      if (!wearableSlots.some((s) => filters.slots.includes(s))) return false;
    }

    if (filters.rarityTiers.length > 0) {
      if (!filters.rarityTiers.includes(w.rarity)) return false;
    }

    if (filters.sets.length > 0) {
      if (!w.setIds.some((s) => filters.sets.includes(s))) return false;
    }

    const [nrg, agg, spk, brn] = w.traitModifiers;

    if (filters.nrgMin && nrg < parseInt(filters.nrgMin)) return false;
    if (filters.nrgMax && nrg > parseInt(filters.nrgMax)) return false;
    if (filters.aggMin && agg < parseInt(filters.aggMin)) return false;
    if (filters.aggMax && agg > parseInt(filters.aggMax)) return false;
    if (filters.spkMin && spk < parseInt(filters.spkMin)) return false;
    if (filters.spkMax && spk > parseInt(filters.spkMax)) return false;
    if (filters.brnMin && brn < parseInt(filters.brnMin)) return false;
    if (filters.brnMax && brn > parseInt(filters.brnMax)) return false;

    if (filters.positiveModsOnly) {
      const hasPosi = w.traitModifiers.slice(0, 4).some((m) => m > 0);
      if (!hasPosi) return false;
    }

    if (filters.negativeModsOnly) {
      const hasNeg = w.traitModifiers.slice(0, 4).some((m) => m < 0);
      if (!hasNeg) return false;
    }

    if (filters.statModifyingOnly === true) {
      const hasStats = w.traitModifiers.slice(0, 4).some((m) => m !== 0);
      if (!hasStats) return false;
    } else if (filters.statModifyingOnly === false) {
      const hasStats = w.traitModifiers.slice(0, 4).some((m) => m !== 0);
      if (hasStats) return false;
    }

    if (filters.hasSetBonus === true) {
      if (!w.setIds || w.setIds.length === 0) return false;
    } else if (filters.hasSetBonus === false) {
      if (w.setIds && w.setIds.length > 0) return false;
    }

    if (mode === "mine") {
      const qty = ownedCounts[w.id] || 0;
      if (filters.quantityMin && qty < parseInt(filters.quantityMin)) return false;
      if (filters.quantityMax && qty > parseInt(filters.quantityMax)) return false;
      if (qty === 0) return false;
    }

    if (mode === "baazaar") {
      const priceStr = pricesMap[w.id];
      if (!priceStr) return false;
      const price = parseFloat(priceStr);
      if (filters.priceMin && price < parseFloat(filters.priceMin)) return false;
      if (filters.priceMax && price > parseFloat(filters.priceMax)) return false;
    }

    return true;
  });
}

function applySort(
  wearables: ExplorerWearable[],
  sort: WearableSort,
  ownedCounts: Record<number, number>,
  prices: Record<number, string>
): ExplorerWearable[] {
  const sorted = [...wearables];
  const dir = sort.direction === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sort.field) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "id":
        return dir * (a.id - b.id);
      case "rarity":
        return dir * (b.rarityScoreModifier - a.rarityScoreModifier);
      case "slot":
        return dir * ((a.slots[0] || 0) - (b.slots[0] || 0));
      case "totalStats": {
        const totalA = a.traitModifiers.slice(0, 4).reduce((s, m) => s + Math.abs(m), 0);
        const totalB = b.traitModifiers.slice(0, 4).reduce((s, m) => s + Math.abs(m), 0);
        return dir * (totalB - totalA);
      }
      case "quantity": {
        const qtyA = ownedCounts[a.id] || 0;
        const qtyB = ownedCounts[b.id] || 0;
        return dir * (qtyB - qtyA);
      }
      case "price": {
        const priceA = parseFloat(prices[a.id] || "999999999");
        const priceB = parseFloat(prices[b.id] || "999999999");
        return dir * (priceA - priceB);
      }
      default:
        return 0;
    }
  });

  return sorted;
}

export function useWearableExplorerData(mode: DataMode) {
  const wearables = useAppStore((s) => s.wearables);
  const gotchis = useAppStore((s) => s.gotchis);
  const sets = useAppStore((s) => s.sets);
  const { baazaarPrices, baazaarLoading } = useBaazaar();

  const [filters, setFilters] = useState<WearableExplorerFilters>(defaultWearableFilters);
  const [sort, setSort] = useState<WearableSort>(defaultWearableSort);
  const [page, setPage] = useState(1);

  const ownedCounts = useMemo(() => computeOwnedCounts(gotchis), [gotchis]);

  const pricesMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const [id, priceData] of Object.entries(baazaarPrices)) {
      if (priceData && typeof priceData === "object" && "minPriceGHST" in priceData) {
        map[parseInt(id)] = priceData.minPriceGHST;
      }
    }
    return map;
  }, [baazaarPrices]);

  const allWearables = useMemo(() => {
    return wearables.map(wearableToExplorer);
  }, [wearables]);

  const filteredWearables = useMemo(() => {
    const filtered = applyFilters(allWearables, filters, ownedCounts, pricesMap, mode);
    return applySort(filtered, sort, ownedCounts, pricesMap);
  }, [allWearables, filters, ownedCounts, pricesMap, mode, sort]);

  const paginatedWearables = useMemo(() => {
    return filteredWearables.slice(0, page * PAGE_SIZE);
  }, [filteredWearables, page]);

  const hasMore = paginatedWearables.length < filteredWearables.length;
  const loading = baazaarLoading && mode === "baazaar";

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      setPage((p) => p + 1);
    }
  }, [hasMore, loading]);

  useEffect(() => {
    setPage(1);
  }, [filters, sort, mode]);

  const updateFilters = useCallback((updates: Partial<WearableExplorerFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultWearableFilters);
  }, []);

  return {
    wearables: paginatedWearables,
    totalCount: filteredWearables.length,
    loading,
    hasMore,
    loadMore,
    filters,
    setFilters: updateFilters,
    resetFilters,
    sort,
    setSort,
    ownedCounts,
    pricesMap,
    sets,
  };
}
