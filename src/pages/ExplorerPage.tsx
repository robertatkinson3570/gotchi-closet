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
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ExplorerPage() {
  const { connectedAddress, isConnected } = useAddressState();
  const [mode, setMode] = useState<DataMode>("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  const availableSets = useMemo(() => {
    const sets = new Set<string>();
    gotchis.forEach((g) => {
      if (g.equippedSetName) sets.add(g.equippedSetName);
    });
    return Array.from(sets).sort();
  }, [gotchis]);

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
        <aside className={`hidden lg:flex flex-col border-r border-border/30 bg-muted/10 transition-all duration-300 ${sidebarOpen ? "w-72" : "w-0"} overflow-hidden relative`}>
          <div className="flex-1 overflow-y-auto">
            <ExplorerFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              availableSets={availableSets}
            />
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-background border border-border/50 rounded-r-lg flex items-center justify-center hover:bg-muted/50 transition-colors shadow-md"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </aside>

        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-background border border-border/50 rounded-r-lg items-center justify-center hover:bg-muted/50 transition-colors shadow-md"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

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
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background shadow-xl overflow-hidden animate-in slide-in-from-left duration-200">
            <ExplorerFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClose={() => setShowFilters(false)}
              isMobile
              availableSets={availableSets}
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
