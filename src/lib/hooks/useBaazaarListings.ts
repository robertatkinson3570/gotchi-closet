import { useState, useEffect, useCallback, useRef } from "react";
import { fetchBaazaarListings, type BaazaarListing } from "@/lib/baazaarListings";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 250;

export type BaazaarListingsState = {
  listings: BaazaarListing[];
  isLoading: boolean;
  hasMore: boolean;
  error?: string;
  loadMore: () => void;
};

type FilterType = "none" | "tokenId" | "seller" | "name";

function detectFilterType(query: string): { type: FilterType; value: string } {
  const trimmed = query.trim();
  if (!trimmed) {
    return { type: "none", value: "" };
  }
  if (trimmed.startsWith("0x")) {
    return { type: "seller", value: trimmed };
  }
  if (/^\d+$/.test(trimmed)) {
    return { type: "tokenId", value: trimmed };
  }
  return { type: "name", value: trimmed };
}

export function useBaazaarListings(
  enabled: boolean,
  query: string = ""
): BaazaarListingsState {
  const [listings, setListings] = useState<BaazaarListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [filterKey, setFilterKey] = useState<string>("newest|none|");
  
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

  // Generate cache key for this filter combination
  const updateFilter = useCallback((searchQuery: string) => {
    const filter = detectFilterType(searchQuery);
    const key = `newest|${filter.type}|${filter.value}`;
    setFilterKey(key);
    setListings([]);
    setHasMore(true);
  }, []);

  // Debounced filter update
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!enabled) {
      setListings([]);
      setHasMore(true);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      updateFilter(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, enabled, updateFilter]);

  // Fetch listings when filter changes (only first page, loadMore handles pagination)
  useEffect(() => {
    if (!enabled) {
      setListings([]);
      setHasMore(true);
      return;
    }

    const filter = detectFilterType(query);
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(undefined);

    fetchBaazaarListings({
      first: PAGE_SIZE,
      skip: 0,
      orderBy: "timeCreated",
      orderDirection: "desc",
      filterTokenId: filter.type === "tokenId" ? filter.value : undefined,
      filterSeller: filter.type === "seller" ? filter.value : undefined,
    })
      .then((result) => {
        if (abortControllerRef.current?.signal.aborted) return;
        
        // Client-side name filtering if needed
        let filtered = result.listings;
        if (filter.type === "name") {
          const normalized = filter.value.toLowerCase();
          filtered = result.listings.filter(
            (l) =>
              l.gotchi.name.toLowerCase().includes(normalized) ||
              l.tokenId.toLowerCase().includes(normalized)
          );
        }

        setListings(filtered);
        setHasMore(result.hasMore && filtered.length > 0);
      })
      .catch((err) => {
        if (abortControllerRef.current?.signal.aborted) return;
        setError(err.message || "Failed to fetch listings");
        setListings([]);
        setHasMore(false);
      })
      .finally(() => {
        if (!abortControllerRef.current?.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, filterKey, query]);

  const loadMore = useCallback(() => {
    if (!enabled || isLoading || !hasMore) return;

    const filter = detectFilterType(query);
    const currentSkip = listings.length;

    setIsLoading(true);
    setError(undefined);

    fetchBaazaarListings({
      first: PAGE_SIZE,
      skip: currentSkip,
      orderBy: "timeCreated",
      orderDirection: "desc",
      filterTokenId: filter.type === "tokenId" ? filter.value : undefined,
      filterSeller: filter.type === "seller" ? filter.value : undefined,
    })
      .then((result) => {
        // Client-side name filtering if needed
        let filtered = result.listings;
        if (filter.type === "name") {
          const normalized = filter.value.toLowerCase();
          filtered = result.listings.filter(
            (l) =>
              l.gotchi.name.toLowerCase().includes(normalized) ||
              l.tokenId.toLowerCase().includes(normalized)
          );
        }

        setListings((prev) => [...prev, ...filtered]);
        setHasMore(result.hasMore && filtered.length > 0);
      })
      .catch((err) => {
        setError(err.message || "Failed to load more listings");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [enabled, isLoading, hasMore, listings.length, query]);

  return {
    listings,
    isLoading,
    hasMore,
    error,
    loadMore,
  };
}
