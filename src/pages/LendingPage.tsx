import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { LendingTopBar } from "@/components/lending/LendingTopBar";
import { LendingFilters } from "@/components/lending/LendingFilters";
import { LendingGrid } from "@/components/lending/LendingGrid";
import { LendingDetailModal } from "@/components/lending/LendingDetailModal";
import { SavedSearchesBar } from "@/components/lending/SavedSearchesBar";
import { useLendings } from "@/hooks/useLendings";
import { useMyWhitelistMemberIds } from "@/hooks/useWhitelists";
import {
  defaultLendingFilters,
  defaultLendingSort,
} from "@/lib/lending/types";
import type { LendingFilters as Filters, LendingSort } from "@/lib/lending/types";
import {
  applyLendingFilters,
  applyLendingSort,
  getActiveLendingFilterCount,
} from "@/lib/lending/filters";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";

const FILTERS_OPEN_KEY = "gc_lending_filtersOpen";

export default function LendingPage() {
  const { lendings, loading, error } = useLendings();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL — `?owner=0x…` becomes a search by address
  const initialFilters = useMemo<Filters>(() => {
    const owner = searchParams.get("owner");
    if (owner && /^0x[a-fA-F0-9]{40}$/.test(owner)) {
      return { ...defaultLendingFilters, search: owner.toLowerCase() };
    }
    return defaultLendingFilters;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sort, setSort] = useState<LendingSort>(defaultLendingSort);
  const detailId = searchParams.get("l");
  const closeDetail = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("l");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Keep `?owner=` in URL in sync with search field when it's an address
  useEffect(() => {
    const isAddress = /^0x[a-f0-9]{40}$/.test(filters.search.trim().toLowerCase());
    const current = searchParams.get("owner");
    const next = new URLSearchParams(searchParams);
    if (isAddress) {
      if (current !== filters.search.toLowerCase()) {
        next.set("owner", filters.search.toLowerCase());
        setSearchParams(next, { replace: true });
      }
    } else {
      if (current) {
        next.delete("owner");
        setSearchParams(next, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(FILTERS_OPEN_KEY);
    return saved == null ? true : saved === "1";
  });

  useEffect(() => {
    localStorage.setItem(FILTERS_OPEN_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  const myWhitelistIds = useMyWhitelistMemberIds();
  const filtered = useMemo(
    () => applyLendingFilters(lendings, filters, myWhitelistIds),
    [lendings, filters, myWhitelistIds]
  );

  // Hotkeys
  useHotkeys("/", (e) => {
    e.preventDefault();
    const input = document.querySelector<HTMLInputElement>('[data-testid="lending-search"]');
    input?.focus();
  });
  useHotkeys("escape", () => {
    if (detailId) closeDetail();
  });
  useHotkeys("f", () => {
    setSidebarOpen((o) => !o);
  });

  const sorted = useMemo(() => applyLendingSort(filtered, sort), [filtered, sort]);

  const filterCount = getActiveLendingFilterCount(filters);

  const handleSearch = useCallback(
    (v: string) => setFilters((f) => ({ ...f, search: v })),
    []
  );

  const clearAllFilters = useCallback(() => {
    setFilters(defaultLendingFilters);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Seo
        title="Lending Marketplace — GotchiCloset"
        description="Browse Aavegotchi rental listings on Base. Filter by BRS w/ wearables, duration, price, channelling, and whitelist."
        canonical={siteUrl("/lending")}
      />

      <LendingTopBar
        search={filters.search}
        onSearchChange={handleSearch}
        sort={sort}
        onSortChange={setSort}
        count={sorted.length}
        total={lendings.length}
        visibleLendings={sorted}
      />

      <SavedSearchesBar
        filters={filters}
        sort={sort}
        onApply={(s) => {
          setFilters(s.filters);
          setSort(s.sort);
        }}
      />

      <div className="flex-1 flex">
        <aside
          className={`hidden lg:flex flex-col border-r border-border/30 bg-muted/10 transition-all duration-300 ${
            sidebarOpen ? "w-72" : "w-12"
          } overflow-hidden relative`}
        >
          {sidebarOpen ? (
            <>
              <div className="flex-1 overflow-y-auto p-3">
                <LendingFilters filters={filters} onChange={setFilters} />
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
              <span
                className="text-xs text-muted-foreground group-hover:text-primary"
                style={{ writingMode: "vertical-rl" }}
              >
                Filters
              </span>
            </button>
          )}
        </aside>

        <main className="flex-1 min-w-0">
          {filterCount > 0 && (
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-muted-foreground shrink-0">
                {filterCount} active filter{filterCount === 1 ? "" : "s"}:
              </span>
              <button
                onClick={clearAllFilters}
                className="text-xs text-primary hover:underline shrink-0 inline-flex items-center gap-1"
                data-testid="lending-clear-filters"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            </div>
          )}

          <LendingGrid lendings={sorted} loading={loading} error={error} />
        </main>
      </div>

      {detailId && <LendingDetailModal lendingId={detailId} onClose={closeDetail} />}
    </div>
  );
}
