import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Search, ChevronDown, ChevronUp, X, Loader2 } from "lucide-react";
import { useGotchiSearch } from "@/lib/hooks/useGotchiSearch";
import { useBaazaarListings } from "@/lib/hooks/useBaazaarListings";
import { transformBaazaarListingToGotchi, fetchBaazaarListings } from "@/lib/baazaarListings";
import { fetchGotchiByTokenId } from "@/graphql/fetchers";
import { GotchiCard } from "./GotchiCard";
import { computeInstanceTraits, useWearablesById } from "@/state/selectors";
import { useQuery } from "@tanstack/react-query";
import type { Gotchi } from "@/types";

type SearchMode = "name" | "baazaar";

type GotchiSearchProps = {
  onAdd: (gotchi: Gotchi) => void;
  excludeIds: Set<string>;
  rightElement?: React.ReactNode;
};

export function GotchiSearch({ onAdd, excludeIds, rightElement }: GotchiSearchProps) {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<SearchMode>("name");
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadingGotchiId, setLoadingGotchiId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baazaarScrollRef = useRef<HTMLDivElement>(null);
  const wearablesById = useWearablesById();

  // Name/ID search (existing behavior)
  const { results: nameResults, isLoading: nameLoading, error: nameError } = useGotchiSearch(
    search,
    mode === "name" && (isExpanded || search.length >= 2)
  );

  // Also run name search for Baazaar mode to find gotchis by name
  const isNameSearch = search.trim().length >= 2 && !/^\d+$/.test(search.trim()) && !search.trim().startsWith("0x");
  const { results: baazaarNameResults } = useGotchiSearch(
    search,
    mode === "baazaar" && isExpanded && isNameSearch
  );

  // For gotchis found by name search, check if they have Baazaar listings
  const { data: nameMatchListings = [], isLoading: nameMatchLoading } = useQuery({
    queryKey: ["baazaar-name-match", baazaarNameResults.map(g => g.id).join(",")],
    queryFn: async () => {
      if (baazaarNameResults.length === 0) return [];
      
      // Fetch listings for each found gotchi
      const listings = await Promise.all(
        baazaarNameResults.slice(0, 5).map(async (gotchi) => {
          try {
            const result = await fetchBaazaarListings({
              first: 1,
              skip: 0,
              orderBy: "timeCreated",
              orderDirection: "desc",
              filterTokenId: gotchi.id,
            });
            return result.listings[0] || null;
          } catch {
            return null;
          }
        })
      );
      return listings.filter(Boolean);
    },
    enabled: mode === "baazaar" && baazaarNameResults.length > 0 && isNameSearch,
    staleTime: 30_000,
  });

  // Baazaar listings (new)
  const {
    listings: baazaarListings,
    isLoading: baazaarLoading,
    hasMore: baazaarHasMore,
    error: baazaarError,
    loadMore: baazaarLoadMore,
  } = useBaazaarListings(mode === "baazaar" && isExpanded, search);

  // Infinite scroll for Baazaar - trigger load when scrolled near right edge
  const handleBaazaarScroll = useCallback(() => {
    const container = baazaarScrollRef.current;
    if (!container || baazaarLoading || !baazaarHasMore) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const scrollRight = scrollWidth - scrollLeft - clientWidth;
    
    // Load more when within 200px of right edge
    if (scrollRight < 200) {
      baazaarLoadMore();
    }
  }, [baazaarLoading, baazaarHasMore, baazaarLoadMore]);

  // Transform Baazaar listings to Gotchi format, merging name-matched listings
  const baazaarGotchis = useMemo(() => {
    const fromListings = baazaarListings.map(transformBaazaarListingToGotchi);
    const validNameMatches = nameMatchListings.filter((l): l is NonNullable<typeof l> => l !== null);
    const fromNameMatch = validNameMatches.map(transformBaazaarListingToGotchi);
    
    // Merge: name match results first (if searching), then regular listings
    const seenIds = new Set<string>();
    const merged: Gotchi[] = [];
    
    // Add name matches first (they're more relevant when searching by name)
    for (const g of fromNameMatch) {
      if (!seenIds.has(g.id) && !excludeIds.has(g.id)) {
        seenIds.add(g.id);
        merged.push(g);
      }
    }
    
    // Add remaining listings
    for (const g of fromListings) {
      if (!seenIds.has(g.id) && !excludeIds.has(g.id)) {
        seenIds.add(g.id);
        merged.push(g);
      }
    }
    
    return merged;
  }, [baazaarListings, nameMatchListings, excludeIds]);

  const filteredNameResults = nameResults.filter((g) => !excludeIds.has(g.id));

  // Auto-expand Baazaar mode on activation
  useEffect(() => {
    if (mode === "baazaar") {
      setIsExpanded(true);
    }
  }, [mode]);
  
  // Handle mode change: reopen Baazaar panel when switching to Baazaar mode
  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (newMode === "baazaar") {
      setIsExpanded(true);
    } else if (newMode === "name") {
      // Keep expanded if there's a search query
      if (search.length < 2) {
        setIsExpanded(false);
      }
    }
  };

  useEffect(() => {
    if (mode === "name" && search.length >= 2) {
      setIsExpanded(true);
    }
  }, [search, mode]);

  const handleSelect = async (gotchi: Gotchi) => {
    // For Baazaar gotchis, load via proper pipeline first
    if (mode === "baazaar" && gotchi.market?.source === "baazaar") {
      const tokenId = gotchi.gotchiId || gotchi.id;
      setLoadingGotchiId(tokenId);
      
      try {
        // Load the full gotchi data using the same pipeline as Name/ID search
        const loadedGotchi = await fetchGotchiByTokenId(tokenId);
        
        if (!loadedGotchi) {
          console.error(`[GotchiSearch] Failed to load gotchi ${tokenId}`);
          setLoadingGotchiId(null);
          return;
        }
        
        // Attach market metadata from the listing
        const gotchiWithMarket: Gotchi = {
          ...loadedGotchi,
          market: gotchi.market,
        };
        
        // Add to selector
        onAdd(gotchiWithMarket);
        
        // Collapse Baazaar panel after adding
        setIsExpanded(false);
      } catch (error) {
        console.error(`[GotchiSearch] Error loading gotchi ${tokenId}:`, error);
        setLoadingGotchiId(null);
      } finally {
        setLoadingGotchiId(null);
      }
    } else {
      // For Collection mode, use existing behavior
      onAdd(gotchi);
      setSearch("");
      setIsExpanded(false);
    }
  };

  const handleClear = () => {
    setSearch("");
    if (mode === "name") {
      setIsExpanded(false);
    }
  };

  const isLoading = mode === "name" ? nameLoading : (baazaarLoading || nameMatchLoading);
  const error = mode === "name" ? nameError : baazaarError;
  const showResults = mode === "name" ? filteredNameResults.length > 0 : baazaarGotchis.length > 0;
  const shouldShowResults = mode === "name" 
    ? (isExpanded && search.length >= 2)
    : isExpanded;

  // Format price for display
  const formatPrice = (priceInWei: string): string => {
    const price = parseFloat(priceInWei) / 1e18;
    if (price >= 1000) {
      return `${(price / 1000).toFixed(2)}k GHST`;
    }
    return `${price.toFixed(2)} GHST`;
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-background/80 border-b">
        {/* Mode selector - polished toggle */}
        <div className="flex items-center p-0.5 bg-muted/50 rounded-lg border border-border/50">
          <button
            onClick={() => handleModeChange("name")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "name"
                ? "bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Collection"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="hidden sm:inline">Collection</span>
          </button>
          <button
            onClick={() => handleModeChange("baazaar")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              mode === "baazaar"
                ? "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Baazaar"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span className="hidden sm:inline">Baazaar</span>
          </button>
        </div>

        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={
            mode === "baazaar"
              ? "Filter listings by name, ID, or seller address..."
              : "Search entire Aavegotchi collection by name or ID..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => {
            if (mode === "baazaar" || (mode === "name" && search.length >= 2)) {
              setIsExpanded(true);
            }
          }}
          className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
        {showResults && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
        {rightElement}
      </div>

      {shouldShowResults && (
        <div className="border-b bg-muted/30">
          {error && (
            <div className="px-4 py-2 text-sm text-destructive">
              Error: {error}
            </div>
          )}

          {mode === "name" && (
            <>
              {!isLoading && filteredNameResults.length === 0 && search.length >= 2 && (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  No gotchis found matching "{search}"
                </div>
              )}
              {filteredNameResults.length > 0 && (
                <div className="flex gap-3 overflow-x-auto p-2 scrollbar-thin">
                  {filteredNameResults.map((gotchi) => {
                    const {
                      finalTraits,
                      traitBase,
                      traitWithMods,
                      wearableFlat,
                      setFlatBrs,
                      ageBrs,
                      totalBrs,
                      activeSets,
                    } = computeInstanceTraits({
                      baseTraits: gotchi.numericTraits,
                      modifiedNumericTraits: gotchi.modifiedNumericTraits,
                      withSetsNumericTraits: gotchi.withSetsNumericTraits,
                      equippedBySlot: gotchi.equippedWearables,
                      wearablesById,
                      blocksElapsed: gotchi.blocksElapsed,
                    });
                    const activeSetNames = activeSets.map((set) => set.name);
                    return (
                      <div
                        key={gotchi.id}
                        className="flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary rounded-lg transition-all"
                        onClick={() => handleSelect(gotchi)}
                      >
                        <GotchiCard
                          gotchi={gotchi}
                          traitBase={gotchi.baseRarityScore ?? traitBase}
                          traitWithMods={traitWithMods}
                          wearableFlat={wearableFlat}
                          setFlatBrs={setFlatBrs}
                          ageBrs={ageBrs}
                          totalBrs={totalBrs}
                          activeSetNames={activeSetNames}
                          traits={finalTraits}
                          onSelect={() => handleSelect(gotchi)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {mode === "baazaar" && (
            <>
              {!isLoading && baazaarGotchis.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  {search ? `No listings found matching "${search}"` : "No listings available"}
                </div>
              )}
              {baazaarGotchis.length > 0 && (
                <div className="p-2">
                  <div 
                    ref={baazaarScrollRef}
                    onScroll={handleBaazaarScroll}
                    className="flex gap-3 overflow-x-auto scrollbar-thin pb-2"
                  >
                    {baazaarGotchis.map((gotchi) => {
                      const {
                        finalTraits,
                        traitBase,
                        traitWithMods,
                        wearableFlat,
                        setFlatBrs,
                        ageBrs,
                        totalBrs,
                        activeSets,
                      } = computeInstanceTraits({
                        baseTraits: gotchi.numericTraits,
                        modifiedNumericTraits: gotchi.modifiedNumericTraits,
                        withSetsNumericTraits: gotchi.withSetsNumericTraits,
                        equippedBySlot: gotchi.equippedWearables,
                        wearablesById,
                        blocksElapsed: gotchi.blocksElapsed,
                      });
                      const activeSetNames = activeSets.map((set) => set.name);
                      const price = gotchi.market?.price ? formatPrice(gotchi.market.price) : undefined;
                      const isLoadingThis = loadingGotchiId === (gotchi.gotchiId || gotchi.id);

                      return (
                        <div
                          key={gotchi.id}
                          className={`flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-fuchsia-500 rounded-lg transition-all relative ${isLoadingThis ? 'opacity-60 pointer-events-none' : ''}`}
                          onClick={() => handleSelect(gotchi)}
                        >
                          {isLoadingThis && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg z-10">
                              <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500" />
                            </div>
                          )}
                          <GotchiCard
                            gotchi={gotchi}
                            traitBase={gotchi.baseRarityScore ?? traitBase}
                            traitWithMods={traitWithMods}
                            wearableFlat={wearableFlat}
                            setFlatBrs={setFlatBrs}
                            ageBrs={ageBrs}
                            totalBrs={totalBrs}
                            activeSetNames={activeSetNames}
                            traits={finalTraits}
                            price={price}
                          />
                        </div>
                      );
                    })}
                    {/* Loading indicator at end */}
                    {baazaarHasMore && (
                      <div className="flex-shrink-0 flex items-center justify-center w-20">
                        {baazaarLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Scroll for more</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Load more & filter notice */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2">
                    {search && (
                      <span className="text-[10px] text-muted-foreground">
                        Filter applies to loaded results
                      </span>
                    )}
                    {baazaarHasMore && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={baazaarLoadMore}
                        disabled={isLoading}
                        className="h-6 text-xs ml-auto"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Load More"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
