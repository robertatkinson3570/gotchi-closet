import { useState, useMemo, useCallback } from "react";
import { ExplorerTopBar } from "@/components/explorer/ExplorerTopBar";
import { ExplorerFilters } from "@/components/explorer/ExplorerFilters";
import { ExplorerGrid } from "@/components/explorer/ExplorerGrid";
import { GotchiDetailDrawer } from "@/components/explorer/GotchiDetailDrawer";
import { SortSheet } from "@/components/explorer/SortSheet";
import { useExplorerData } from "@/hooks/useExplorerData";
import { useAddressState } from "@/lib/addressState";
import type { DataMode, ExplorerGotchi, ExplorerFilters as FiltersType } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { getActiveFilterCount } from "@/lib/explorer/filters";

export default function ExplorerPage() {
  const { connectedAddress, isConnected } = useAddressState();
  const [mode, setMode] = useState<DataMode>("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [selectedGotchi, setSelectedGotchi] = useState<ExplorerGotchi | null>(null);

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

  const filterCount = getActiveFilterCount(filters);

  const handleFiltersChange = useCallback((newFilters: FiltersType) => {
    setFilters(newFilters);
  }, [setFilters]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ExplorerTopBar
        mode={mode}
        onModeChange={setMode}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        filterCount={filterCount}
        onOpenFilters={() => setShowFilters(true)}
        onOpenSort={() => setShowSort(true)}
        connectedAddress={connectedAddress}
        isConnected={isConnected}
      />

      <div className="flex-1 flex">
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

          <ExplorerGrid
            gotchis={filteredBySearch}
            loading={loading}
            hasMore={hasMore}
            error={error}
            onLoadMore={loadMore}
            onSelectGotchi={setSelectedGotchi}
          />
        </main>
      </div>

      {showFilters && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background shadow-xl overflow-hidden animate-in slide-in-from-right duration-200">
            <ExplorerFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClose={() => setShowFilters(false)}
              isMobile
            />
          </div>
        </div>
      )}

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
