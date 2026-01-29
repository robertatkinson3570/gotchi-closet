import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
  const { connectedAddress } = useAddressState();
  const [mode, setMode] = useState<DataMode>("all");
  const [ownerAddress, setOwnerAddress] = useState("");
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
  } = useExplorerData(mode, ownerAddress || null, connectedAddress);

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return gotchis;
    const s = search.toLowerCase().trim();
    return gotchis.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        g.tokenId === s ||
        g.tokenId.includes(s)
    );
  }, [gotchis, search]);

  const filterCount = getActiveFilterCount(filters);

  const handleFiltersChange = useCallback((newFilters: FiltersType) => {
    setFilters(newFilters);
  }, [setFilters]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-12 md:h-14 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-3 md:px-4">
          <Link to="/" className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity">
            <img
              src="/logo.png"
              alt="GotchiCloset"
              className="h-8 md:h-10 w-8 md:w-10 object-contain"
            />
            <div className="text-base md:text-lg font-semibold tracking-tight truncate">
              Gotchi
              <span className="font-normal text-muted-foreground">Explorer</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/dress"
              className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Dress
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ExplorerTopBar
        mode={mode}
        onModeChange={setMode}
        ownerAddress={ownerAddress}
        onOwnerChange={setOwnerAddress}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        filterCount={filterCount}
        onOpenFilters={() => setShowFilters(true)}
        onOpenSort={() => setShowSort(true)}
      />

      <div className="flex-1 flex">
        <aside className="hidden lg:block w-72 border-r bg-muted/20 overflow-y-auto sticky top-[104px] h-[calc(100vh-104px)]">
          <ExplorerFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
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
          <div className="absolute inset-x-0 bottom-0 top-16 bg-background rounded-t-xl overflow-hidden">
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
