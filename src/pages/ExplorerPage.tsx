import { useState, useMemo, useCallback, useEffect } from "react";
import { ExplorerTopBar } from "@/components/explorer/ExplorerTopBar";
import { ExplorerFilters } from "@/components/explorer/ExplorerFilters";
import { ExplorerGrid } from "@/components/explorer/ExplorerGrid";
import { FamilyPhotoGrid } from "@/components/explorer/FamilyPhotoGrid";
import { TakePictureButton } from "@/components/explorer/TakePictureButton";
import { SortSheet } from "@/components/explorer/SortSheet";
import { WearableExplorerGrid } from "@/components/explorer/WearableExplorerGrid";
import { WearableExplorerFilters } from "@/components/explorer/WearableExplorerFilters";
import { WearableSortSheet } from "@/components/explorer/WearableSortSheet";
import { useExplorerData } from "@/hooks/useExplorerData";
import { useWearableExplorerData } from "@/hooks/useWearableExplorerData";
import { useAddressState } from "@/lib/addressState";
import { useAppStore } from "@/state/useAppStore";
import { fetchAllWearables, fetchAllWearableSets } from "@/graphql/fetchers";
import { cacheGet, cacheSet, cacheIsStale, CACHE_KEYS } from "@/lib/cache";
import type { DataMode, ExplorerFilters as FiltersType } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { getActiveFilterCount } from "@/lib/explorer/filters";
import { defaultBaazaarSort } from "@/lib/explorer/sorts";
import type { AssetType } from "@/lib/explorer/wearableTypes";
import { ChevronLeft, ChevronRight } from "lucide-react";
import setsData from "../../data/setsByTraitDirection.json";

export type ViewMode = "cards" | "family";
const VIEW_MODE_KEY = "gc_explorer_viewMode";
const ASSET_TYPE_KEY = "gc_explorer_assetType";

export default function ExplorerPage() {
  const { connectedAddress, isConnected } = useAddressState();
  const setWearables = useAppStore((s) => s.setWearables);
  const setSets = useAppStore((s) => s.setSets);
  const storeWearables = useAppStore((s) => s.wearables);
  const [assetType, setAssetType] = useState<AssetType>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(ASSET_TYPE_KEY);
      return (saved === "wearable" ? "wearable" : "gotchi") as AssetType;
    }
    return "gotchi";
  });
  const [mode, setMode] = useState<DataMode>("all");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSort, setShowSort] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return (saved === "family" ? "family" : "cards") as ViewMode;
    }
    return "cards";
  });

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(ASSET_TYPE_KEY, assetType);
  }, [assetType]);

  useEffect(() => {
    if (mode !== "mine" && viewMode === "family") {
      setViewMode("cards");
    }
  }, [mode, viewMode]);

  useEffect(() => {
    if (assetType !== "wearable") return;
    if (storeWearables.length > 0) return;

    type WearablesState = ReturnType<typeof useAppStore.getState>["wearables"];
    const cachedWearables = cacheGet<WearablesState>(CACHE_KEYS.WEARABLES);
    if (cachedWearables && cachedWearables.length > 0) {
      setWearables(cachedWearables);
    }

    if (!cachedWearables || cacheIsStale(CACHE_KEYS.WEARABLES)) {
      fetchAllWearables()
        .then((wearables) => {
          setWearables(wearables);
          cacheSet(CACHE_KEYS.WEARABLES, wearables);
        })
        .catch((err) => console.error("Failed to load wearables:", err));
    }

    type SetsState = ReturnType<typeof useAppStore.getState>["sets"];
    const cachedSets = cacheGet<SetsState>(CACHE_KEYS.SETS);
    if (cachedSets) {
      setSets(cachedSets);
    }

    if (!cachedSets || cacheIsStale(CACHE_KEYS.SETS)) {
      fetchAllWearableSets()
        .then((sets) => {
          setSets(sets);
          cacheSet(CACHE_KEYS.SETS, sets);
        })
        .catch((err) => console.error("Failed to load sets:", err));
    }
  }, [assetType, storeWearables.length, setWearables, setSets]);

  const {
    gotchis,
    loading: gotchiLoading,
    hasMore: gotchiHasMore,
    error: gotchiError,
    loadMore: gotchiLoadMore,
    filters: gotchiFilters,
    setFilters: setGotchiFilters,
    sort: gotchiSort,
    setSort: setGotchiSort,
  } = useExplorerData(mode, connectedAddress);

  const {
    wearables,
    loading: wearableLoading,
    hasMore: wearableHasMore,
    loadMore: wearableLoadMore,
    filters: wearableFilters,
    setFilters: setWearableFilters,
    resetFilters: resetWearableFilters,
    sort: wearableSort,
    setSort: setWearableSort,
    ownedCounts,
    pricesMap,
  } = useWearableExplorerData(mode);

  const handleModeChange = useCallback((newMode: DataMode) => {
    setMode(newMode);
    if (newMode === "baazaar" && assetType === "gotchi") {
      setGotchiSort(defaultBaazaarSort);
    }
  }, [setGotchiSort, assetType]);

  const filteredGotchisBySearch = useMemo(() => {
    if (!search.trim()) return gotchis;
    const s = search.toLowerCase().trim();
    return gotchis.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        g.tokenId === s ||
        g.tokenId.includes(s) ||
        (g.owner && g.owner.toLowerCase().includes(s))
    );
  }, [gotchis, search]);

  const filteredWearablesBySearch = useMemo(() => {
    if (!search.trim()) return wearables;
    const s = search.toLowerCase().trim();
    return wearables.filter(
      (w) =>
        w.name.toLowerCase().includes(s) ||
        String(w.id) === s
    );
  }, [wearables, search]);

  const availableSets = useMemo(() => {
    return setsData.sets.map((s) => s.name).sort();
  }, []);

  const gotchiFilterCount = getActiveFilterCount(gotchiFilters);

  const handleGotchiFiltersChange = useCallback((newFilters: FiltersType) => {
    setGotchiFilters(newFilters);
  }, [setGotchiFilters]);

  const wearableFilterCount = 
    wearableFilters.slots.length +
    wearableFilters.rarityTiers.length +
    wearableFilters.sets.length +
    (wearableFilters.nrgMin || wearableFilters.nrgMax ? 1 : 0) +
    (wearableFilters.aggMin || wearableFilters.aggMax ? 1 : 0) +
    (wearableFilters.spkMin || wearableFilters.spkMax ? 1 : 0) +
    (wearableFilters.brnMin || wearableFilters.brnMax ? 1 : 0) +
    (wearableFilters.positiveModsOnly ? 1 : 0) +
    (wearableFilters.negativeModsOnly ? 1 : 0) +
    (wearableFilters.hasSetBonus !== null ? 1 : 0) +
    (wearableFilters.statModifyingOnly !== null ? 1 : 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ExplorerTopBar
        mode={mode}
        onModeChange={handleModeChange}
        search={search}
        onSearchChange={setSearch}
        sort={gotchiSort}
        onSortChange={setGotchiSort}
        onOpenSort={() => setShowSort(true)}
        connectedAddress={connectedAddress}
        isConnected={isConnected}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        assetType={assetType}
        onAssetTypeChange={setAssetType}
        wearableSort={wearableSort}
        onWearableSortChange={setWearableSort}
      />

      <div className="flex-1 flex">
        <aside className={`hidden lg:flex flex-col border-r border-border/30 bg-muted/10 transition-all duration-300 ${sidebarOpen ? "w-72" : "w-12"} overflow-hidden relative`}>
          {sidebarOpen ? (
            <>
              <div className="flex-1 overflow-y-auto p-3">
                {assetType === "gotchi" ? (
                  <ExplorerFilters
                    filters={gotchiFilters}
                    onFiltersChange={handleGotchiFiltersChange}
                    availableSets={availableSets}
                  />
                ) : (
                  <WearableExplorerFilters
                    filters={wearableFilters}
                    setFilters={setWearableFilters}
                    resetFilters={resetWearableFilters}
                    mode={mode}
                  />
                )}
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-0 top-0 bottom-0 w-4 hover:bg-primary/10 transition-colors cursor-pointer flex items-center justify-center group"
                title="Collapse filters"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-2 hover:bg-primary/10 transition-colors cursor-pointer group"
              title="Expand filters"
            >
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
              <span className="text-xs text-muted-foreground group-hover:text-primary writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>Filters</span>
            </button>
          )}
        </aside>

        <main className="flex-1 min-w-0">
          {assetType === "gotchi" && gotchiFilterCount > 0 && (
            <div className="px-2 md:px-4 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-muted-foreground shrink-0">{gotchiFilterCount} active:</span>
              <button
                onClick={() => setGotchiFilters(defaultFilters)}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Clear all
              </button>
            </div>
          )}

          {assetType === "wearable" && wearableFilterCount > 0 && (
            <div className="px-2 md:px-4 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-muted-foreground shrink-0">{wearableFilterCount} active:</span>
              <button
                onClick={resetWearableFilters}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Clear all
              </button>
            </div>
          )}

          {assetType === "gotchi" ? (
            viewMode === "family" && mode === "mine" ? (
              <div>
                <div className="flex justify-end px-2 md:px-3 pt-2">
                  <TakePictureButton 
                    walletAddress={connectedAddress ?? undefined} 
                    isActive={mode === "mine" && viewMode === "family"} 
                  />
                </div>
                <FamilyPhotoGrid
                  gotchis={filteredGotchisBySearch}
                  loading={gotchiLoading}
                  hasMore={gotchiHasMore}
                  error={gotchiError}
                  onLoadMore={gotchiLoadMore}
                />
              </div>
            ) : (
              <ExplorerGrid
                gotchis={filteredGotchisBySearch}
                loading={gotchiLoading}
                hasMore={gotchiHasMore}
                error={gotchiError}
                onLoadMore={gotchiLoadMore}
              />
            )
          ) : (
            <WearableExplorerGrid
              wearables={filteredWearablesBySearch}
              loading={wearableLoading}
              hasMore={wearableHasMore}
              loadMore={wearableLoadMore}
              mode={mode}
              quantities={ownedCounts}
              prices={pricesMap}
            />
          )}
        </main>
      </div>

      {showSort && assetType === "gotchi" && (
        <div className="lg:hidden">
          <SortSheet
            sort={gotchiSort}
            onSortChange={setGotchiSort}
            onClose={() => setShowSort(false)}
          />
        </div>
      )}

      {showSort && assetType === "wearable" && (
        <WearableSortSheet
          open={showSort}
          onOpenChange={setShowSort}
          sort={wearableSort}
          setSort={setWearableSort}
          mode={mode}
        />
      )}
    </div>
  );
}
