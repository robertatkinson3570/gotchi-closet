import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Search, ChevronDown, ChevronUp, X, Loader2, Plus } from "lucide-react";
import { useGotchiSearch } from "@/lib/hooks/useGotchiSearch";
import { useBaazaarListings } from "@/lib/hooks/useBaazaarListings";
import { transformBaazaarListingToGotchi } from "@/lib/baazaarListings";
import { fetchGotchiByTokenId } from "@/graphql/fetchers";
import { GotchiCard } from "./GotchiCard";
import { computeInstanceTraits, useWearablesById } from "@/state/selectors";
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
  const wearablesById = useWearablesById();

  // Name/ID search (existing behavior)
  const { results: nameResults, isLoading: nameLoading, error: nameError } = useGotchiSearch(
    search,
    mode === "name" && (isExpanded || search.length >= 2)
  );

  // Baazaar listings (new)
  const {
    listings: baazaarListings,
    isLoading: baazaarLoading,
    hasMore: baazaarHasMore,
    error: baazaarError,
    loadMore: baazaarLoadMore,
  } = useBaazaarListings(mode === "baazaar" && isExpanded, search);

  // Transform Baazaar listings to Gotchi format
  const baazaarGotchis = useMemo(() => {
    return baazaarListings
      .map(transformBaazaarListingToGotchi)
      .filter((g) => !excludeIds.has(g.id));
  }, [baazaarListings, excludeIds]);

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

  const isLoading = mode === "name" ? nameLoading : baazaarLoading;
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
        {/* Mode selector */}
        <div className="flex items-center gap-1 border-r pr-2 mr-1">
          <button
            onClick={() => handleModeChange("name")}
            className={`px-2 py-1 rounded text-sm transition-colors relative group ${
              mode === "name"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Collection"
          >
            <span className="text-base leading-none">🗂️</span>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-foreground text-background text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
              Collection
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-foreground" />
            </div>
          </button>
          <button
            onClick={() => handleModeChange("baazaar")}
            className={`px-2 py-1 rounded text-sm transition-colors relative group ${
              mode === "baazaar"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Baazaar"
          >
            <span className="text-base leading-none">🏷️</span>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-foreground text-background text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
              Baazaar
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-foreground" />
            </div>
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
                <div className="max-h-[400px] overflow-y-auto p-2 space-y-2">
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
                    const price = gotchi.market?.price ? formatPrice(gotchi.market.price) : "N/A";

                    return (
                      <div
                        key={gotchi.id}
                        className="flex items-center gap-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                      >
                        {/* Gotchi preview */}
                        <div className="flex-shrink-0">
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

                        {/* Listing info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{gotchi.name}</div>
                          <div className="text-xs text-muted-foreground">ID: {gotchi.gotchiId || gotchi.id}</div>
                          <div className="text-sm font-semibold text-primary mt-1">{price}</div>
                        </div>

                        {/* Add button */}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(gotchi);
                          }}
                          disabled={loadingGotchiId === (gotchi.gotchiId || gotchi.id)}
                          className="shrink-0"
                        >
                          {loadingGotchiId === (gotchi.gotchiId || gotchi.id) ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}

                  {/* Load more button */}
                  {baazaarHasMore && (
                    <div className="pt-2 pb-1 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={baazaarLoadMore}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          "Load More"
                        )}
                      </Button>
                    </div>
                  )}

                  {search && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground text-center border-t">
                      Name filter applies to loaded results only
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
