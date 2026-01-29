import { useState, useMemo, useCallback, useEffect } from "react";
import { ExplorerTopBar } from "@/components/explorer/ExplorerTopBar";
import { ExplorerFilters } from "@/components/explorer/ExplorerFilters";
import { ExplorerGrid } from "@/components/explorer/ExplorerGrid";
import { FamilyPhotoGrid } from "@/components/explorer/FamilyPhotoGrid";
import { TakePictureButton } from "@/components/explorer/TakePictureButton";
import { GotchiDetailDrawer } from "@/components/explorer/GotchiDetailDrawer";
import { SortSheet } from "@/components/explorer/SortSheet";
import { useExplorerData } from "@/hooks/useExplorerData";
import { useAddressState } from "@/lib/addressState";
import type { DataMode, ExplorerGotchi, ExplorerFilters as FiltersType } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { getActiveFilterCount } from "@/lib/explorer/filters";
import { defaultBaazaarSort } from "@/lib/explorer/sorts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import setsData from "../../data/setsByTraitDirection.json";

export type ViewMode = "cards" | "family";
const VIEW_MODE_KEY = "gc_explorer_viewMode";

export default function ExplorerPage() {
  const { connectedAddress, isConnected } = useAddressState();
  const [mode, setMode] = useState<DataMode>("all");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSort, setShowSort] = useState(false);
  const [selectedGotchi, setSelectedGotchi] = useState<ExplorerGotchi | null>(null);
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
    if (mode !== "mine" && viewMode === "family") {
      setViewMode("cards");
    }
  }, [mode, viewMode]);

  const {
    gotchis,
    loading,
    hasMore,
    error,
    loadMore,
    filters,
    setFilters,
    sort,
    setSort,
  } = useExplorerData(mode, connectedAddress);

  const handleModeChange = useCallback((newMode: DataMode) => {
    setMode(newMode);
    if (newMode === "baazaar") {
      setSort(defaultBaazaarSort);
    }
  }, [setSort]);

  const filteredBySearch = useMemo(() => {
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

  const availableSets = useMemo(() => {
    return setsData.sets.map((s) => s.name).sort();
  }, []);

  const filterCount = getActiveFilterCount(filters);

  const handleFiltersChange = useCallback((newFilters: FiltersType) => {
    setFilters(newFilters);
  }, [setFilters]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ExplorerTopBar
        mode={mode}
        onModeChange={handleModeChange}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        onOpenSort={() => setShowSort(true)}
        connectedAddress={connectedAddress}
        isConnected={isConnected}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <div className="flex-1 flex">
        <aside className={`hidden lg:flex flex-col border-r border-border/30 bg-muted/10 transition-all duration-300 ${sidebarOpen ? "w-72" : "w-12"} overflow-hidden relative`}>
          {sidebarOpen ? (
            <>
              <div className="flex-1 overflow-y-auto">
                <ExplorerFilters
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  availableSets={availableSets}
                />
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
          {filterCount > 0 && (
            <div className="px-2 md:px-4 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-muted-foreground shrink-0">{filterCount} active:</span>
              <button
                onClick={() => setFilters(defaultFilters)}
                className="text-xs text-primary hover:underline shrink-0"
              >
                Clear all
              </button>
            </div>
          )}

          {viewMode === "family" && mode === "mine" ? (
            <div>
              <div className="flex justify-end px-2 md:px-3 pt-2">
                <TakePictureButton 
                  walletAddress={connectedAddress ?? undefined} 
                  isActive={mode === "mine" && viewMode === "family"} 
                />
              </div>
              <FamilyPhotoGrid
                gotchis={filteredBySearch}
                loading={loading}
                hasMore={hasMore}
                error={error}
                onLoadMore={loadMore}
                onSelectGotchi={setSelectedGotchi}
              />
            </div>
          ) : (
            <ExplorerGrid
              gotchis={filteredBySearch}
              loading={loading}
              hasMore={hasMore}
              error={error}
              onLoadMore={loadMore}
              onSelectGotchi={setSelectedGotchi}
            />
          )}
        </main>
      </div>

      {showSort && (
        <div className="lg:hidden">
          <SortSheet
            sort={sort}
            onSortChange={setSort}
            onClose={() => setShowSort(false)}
          />
        </div>
      )}

      {selectedGotchi && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSelectedGotchi(null)}
          />
          <GotchiDetailDrawer
            gotchi={selectedGotchi}
            onClose={() => setSelectedGotchi(null)}
          />
        </>
      )}
    </div>
  );
}
