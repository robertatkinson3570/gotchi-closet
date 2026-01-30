import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useClient } from "urql";
import { gql } from "urql";
import type { DataMode, ExplorerGotchi, ExplorerFilters, ExplorerSort, SortField } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { applyFilters, applyClientSideFilters } from "@/lib/explorer/filters";
import { applySorts } from "@/lib/explorer/sorts";

// Build a where clause for server-side filtering
function buildWhereClause(filters: ExplorerFilters): Record<string, any> {
  const where: Record<string, any> = { status: 3 };
  
  // Token ID filters
  if (filters.tokenId) {
    where.gotchiId = filters.tokenId;
  }
  if (filters.tokenIdMin) {
    const min = parseInt(filters.tokenIdMin, 10);
    if (!isNaN(min)) where.gotchiId_gte = min.toString();
  }
  if (filters.tokenIdMax) {
    const max = parseInt(filters.tokenIdMax, 10);
    if (!isNaN(max)) where.gotchiId_lte = max.toString();
  }
  
  // Name filter (search)
  if (filters.nameContains) {
    where.name_contains_nocase = filters.nameContains;
  }
  
  // Owner address filter
  if (filters.ownerAddress) {
    where.owner = filters.ownerAddress.toLowerCase();
  }
  
  // Rarity score filters (use withSetsRarityScore)
  if (filters.rarityMin) {
    const min = parseInt(filters.rarityMin, 10);
    if (!isNaN(min)) where.withSetsRarityScore_gte = min.toString();
  }
  if (filters.rarityMax) {
    const max = parseInt(filters.rarityMax, 10);
    if (!isNaN(max)) where.withSetsRarityScore_lte = max.toString();
  }
  
  // Level filters
  if (filters.levelMin) {
    const min = parseInt(filters.levelMin, 10);
    if (!isNaN(min)) where.level_gte = min.toString();
  }
  if (filters.levelMax) {
    const max = parseInt(filters.levelMax, 10);
    if (!isNaN(max)) where.level_lte = max.toString();
  }
  
  // Haunt filter
  if (filters.haunts.length > 0) {
    // Subgraph doesn't support hauntId_in, so we'll use the first one if there's only one
    if (filters.haunts.length === 1) {
      where.hauntId = filters.haunts[0].toString();
    }
    // Multiple haunts need client-side filtering
  }
  
  // GHST pocket filter
  if (filters.hasGhstPocket === true) {
    where.stakedAmount_gt = "0";
  }
  if (filters.ghstBalanceMin) {
    const min = parseFloat(filters.ghstBalanceMin);
    if (!isNaN(min)) {
      const minWei = Math.floor(min * 1e18).toString();
      where.stakedAmount_gte = minWei;
    }
  }
  if (filters.ghstBalanceMax) {
    const max = parseFloat(filters.ghstBalanceMax);
    if (!isNaN(max)) {
      const maxWei = Math.floor(max * 1e18).toString();
      where.stakedAmount_lte = maxWei;
    }
  }
  
  // Equipped set filter
  if (filters.hasEquippedSet === true) {
    where.equippedSetID_gt = "0";
  }
  if (filters.equippedSets.length === 1) {
    where.equippedSetID = filters.equippedSets[0].toString();
  }
  
  return where;
}

// Check if any filters require client-side processing
function hasClientSideFilters(filters: ExplorerFilters): boolean {
  // Filters that can't be done server-side
  return (
    filters.rarityTiers.length > 0 ||
    filters.nrgMin !== "" || filters.nrgMax !== "" ||
    filters.aggMin !== "" || filters.aggMax !== "" ||
    filters.spkMin !== "" || filters.spkMax !== "" ||
    filters.brnMin !== "" || filters.brnMax !== "" ||
    filters.extremeTraits || filters.balancedTraits ||
    filters.hasWearables !== null ||
    filters.wearableCountMin !== "" || filters.wearableCountMax !== "" ||
    filters.haunts.length > 1 || // Multiple haunts need client-side
    (filters.hasGhstPocket === false) || // "No GHST" needs client-side
    (filters.hasEquippedSet === false) || // "No set" needs client-side
    filters.equippedSets.length > 1 || // Multiple sets need client-side
    filters.doubleMythEyes ||
    (filters.priceMin !== "" || filters.priceMax !== "") // Price needs Baazaar source
  );
}

function getSubgraphOrderBy(field: SortField): string {
  switch (field) {
    case "rarity":
      return "withSetsRarityScore";
    case "level":
      return "level";
    case "kinship":
      return "kinship";
    case "xp":
      return "experience";
    case "tokenId":
      return "gotchiId";
    case "price":
      return "gotchiId";
    case "listingCreated":
      return "gotchiId";
    default:
      return "withSetsRarityScore";
  }
}

const GOTCHI_FIELDS = `
  id
  gotchiId
  name
  level
  numericTraits
  modifiedNumericTraits
  withSetsNumericTraits
  equippedWearables
  baseRarityScore
  modifiedRarityScore
  withSetsRarityScore
  hauntId
  collateral
  owner { id }
  kinship
  experience
  escrow
  equippedSetID
  equippedSetName
  usedSkillPoints
  createdAt
  lastInteracted
  minimumStake
  stakedAmount
`;

// Dynamic query builder for filtered gotchis
function buildGotchisQuery(whereClause: Record<string, any>): string {
  const whereStr = JSON.stringify(whereClause).replace(/"([^"]+)":/g, '$1:');
  return `
    query GotchisPaginatedFiltered($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: String!) {
      aavegotchis(
        first: $first
        skip: $skip
        where: ${whereStr}
        orderBy: $orderBy
        orderDirection: $orderDirection
      ) {
        ${GOTCHI_FIELDS}
      }
    }
  `;
}

const GOTCHIS_BY_OWNER_EXPLORER = gql`
  query GotchisByOwnerExplorer($owner: ID!) {
    user(id: $owner) {
      gotchisOwned {
        id
        gotchiId
        name
        level
        numericTraits
        modifiedNumericTraits
        withSetsNumericTraits
        equippedWearables
        baseRarityScore
        modifiedRarityScore
        withSetsRarityScore
        hauntId
        collateral
        owner { id }
        kinship
        experience
        escrow
        equippedSetID
        equippedSetName
        usedSkillPoints
        createdAt
        lastInteracted
        minimumStake
        stakedAmount
      }
    }
  }
`;

const BAAZAAR_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const BAAZAAR_GOTCHI_LISTINGS_QUERY = `
  query BaazaarGotchiListings($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: String!) {
    erc721Listings(
      first: $first
      skip: $skip
      where: {
        category: 3
        cancelled: false
        timePurchased: "0"
      }
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      id
      tokenId
      priceInWei
      seller
      timeCreated
      gotchi {
        id
        gotchiId
        name
        level
        numericTraits
        modifiedNumericTraits
        withSetsNumericTraits
        equippedWearables
        baseRarityScore
        modifiedRarityScore
        withSetsRarityScore
        hauntId
        collateral
        owner { id }
        kinship
        experience
        escrow
        stakedAmount
        equippedSetID
        equippedSetName
        createdAt
        lastInteracted
        usedSkillPoints
        minimumStake
      }
    }
  }
`;

function getBaazaarOrderBy(field: SortField): string {
  switch (field) {
    case "listingCreated":
      return "timeCreated";
    case "price":
      return "priceInWei";
    default:
      return "timeCreated";
  }
}

const gotchiCache = new Map<string, ExplorerGotchi>();
const listingsCache = new Map<string, { id: string; priceInWei: string; seller: string }>();
let listingsCacheLoaded = false;

const BATCH_SIZE_MOBILE = 80;
const BATCH_SIZE_DESKTOP = 120;

async function fetchAllListings(): Promise<void> {
  if (listingsCacheLoaded) return;
  
  try {
    let skip = 0;
    const batchSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const response = await fetch(BAAZAAR_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query AllListings($first: Int!, $skip: Int!) {
              erc721Listings(
                first: $first
                skip: $skip
                where: { category: 3, cancelled: false, timePurchased: "0" }
              ) {
                id
                tokenId
                priceInWei
                seller
              }
            }
          `,
          variables: { first: batchSize, skip },
        }),
      });
      
      if (!response.ok) break;
      
      const data = await response.json();
      const listings = data.data?.erc721Listings || [];
      
      for (const l of listings) {
        listingsCache.set(l.tokenId, {
          id: l.id,
          priceInWei: l.priceInWei,
          seller: l.seller,
        });
      }
      
      hasMore = listings.length >= batchSize;
      skip += batchSize;
    }
    
    listingsCacheLoaded = true;
  } catch (err) {
    console.error("Failed to fetch listings:", err);
  }
}

function applyListingsToGotchis(gotchis: ExplorerGotchi[]): ExplorerGotchi[] {
  return gotchis.map(g => {
    const listing = listingsCache.get(g.tokenId);
    if (listing && !g.listing) {
      return { ...g, listing };
    }
    return g;
  });
}

function transformGotchi(raw: any): ExplorerGotchi {
  const tokenId = raw.gotchiId || raw.id;
  
  const gotchi: ExplorerGotchi = {
    id: raw.id,
    tokenId,
    name: raw.name || "",
    hauntId: parseInt(raw.hauntId, 10) || 1,
    level: raw.level || 1,
    baseRarityScore: raw.baseRarityScore || 0,
    modifiedRarityScore: raw.modifiedRarityScore || raw.baseRarityScore || 0,
    withSetsRarityScore: raw.withSetsRarityScore || raw.modifiedRarityScore || raw.baseRarityScore || 0,
    numericTraits: (raw.numericTraits || []).map((t: any) => Number(t)),
    modifiedNumericTraits: (raw.modifiedNumericTraits || raw.numericTraits || []).map((t: any) => Number(t)),
    withSetsNumericTraits: (raw.withSetsNumericTraits || raw.modifiedNumericTraits || raw.numericTraits || []).map((t: any) => Number(t)),
    equippedWearables: (raw.equippedWearables || []).map((w: any) => Number(w) || 0),
    collateral: raw.collateral || "",
    owner: raw.owner?.id || "",
    kinship: raw.kinship,
    experience: raw.experience,
    listing: raw.listing,
    escrow: raw.escrow,
    createdAt: raw.createdAt ? parseInt(raw.createdAt, 10) : undefined,
    usedSkillPoints: raw.usedSkillPoints ? parseInt(raw.usedSkillPoints, 10) : undefined,
    equippedSetID: raw.equippedSetID ? parseInt(raw.equippedSetID, 10) : undefined,
    equippedSetName: raw.equippedSetName,
    lastInteracted: raw.lastInteracted ? parseInt(raw.lastInteracted, 10) : undefined,
    minimumStake: raw.minimumStake,
    stakedAmount: raw.stakedAmount,
  };
  
  // Only cache if we have complete essential data (prevents caching incomplete gotchis)
  if (gotchi.withSetsRarityScore > 0 && gotchi.createdAt) {
    gotchiCache.set(tokenId, gotchi);
  }
  
  return gotchi;
}

export function useExplorerData(
  mode: DataMode,
  connectedAddress: string | null
) {
  const client = useClient();
  const [gotchis, setGotchis] = useState<ExplorerGotchi[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExplorerFilters>(defaultFilters);
  const [sort, setSort] = useState<ExplorerSort>({ field: "rarity", direction: "desc" });
  
  // Track if this is initial render for filter effect (must be before other hooks)
  const isInitialFilterRender = useRef(true);
  const prevFiltersKey = useRef("");
  const loadInitialRef = useRef<() => void>(() => {});

  const batchSize = typeof window !== "undefined" && window.innerWidth < 768
    ? BATCH_SIZE_MOBILE
    : BATCH_SIZE_DESKTOP;

  const effectiveOwner = mode === "mine" && connectedAddress
    ? connectedAddress.toLowerCase()
    : null;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasMore(true);

    try {
      await fetchAllListings();
      
      if (mode === "mine" && effectiveOwner) {
        const result = await client.query(GOTCHIS_BY_OWNER_EXPLORER, {
          owner: effectiveOwner,
        }).toPromise();

        if (result.error) {
          throw new Error(result.error.message);
        }

        const rawGotchis = result.data?.user?.gotchisOwned || [];
        const gotchisWithListings = applyListingsToGotchis(rawGotchis.map(transformGotchi));
        setGotchis(gotchisWithListings);
        setHasMore(false);
      } else if (mode === "baazaar" || sort.field === "price" || sort.field === "listingCreated" || filters.priceMin || filters.priceMax) {
        const baazaarOrderBy = getBaazaarOrderBy(sort.field);
        const baazaarDirection = (sort.field === "price" || sort.field === "listingCreated") ? sort.direction : "desc";
        const response = await fetch(BAAZAAR_SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: BAAZAAR_GOTCHI_LISTINGS_QUERY,
            variables: { first: batchSize, skip: 0, orderBy: baazaarOrderBy, orderDirection: baazaarDirection },
          }),
        });

        if (!response.ok) {
          throw new Error(`Baazaar request failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.errors) {
          throw new Error(data.errors[0]?.message || "GraphQL error");
        }

        const listings = data.data?.erc721Listings || [];
        const gotchisWithListings = listings
          .filter((l: any) => l.gotchi)
          .map((l: any) => {
            const g = transformGotchi(l.gotchi);
            g.listing = {
              id: l.id,
              priceInWei: l.priceInWei,
              seller: l.seller,
              timeCreated: l.timeCreated,
            };
            return g;
          });
        setGotchis(gotchisWithListings);
        setHasMore(listings.length >= batchSize);
      } else if (mode === "all") {
        // Build where clause from filters for server-side filtering
        const whereClause = buildWhereClause(filters);
        const queryStr = buildGotchisQuery(whereClause);
        const response = await fetch("https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: queryStr,
            variables: {
              first: batchSize,
              skip: 0,
              orderBy: getSubgraphOrderBy(sort.field),
              orderDirection: sort.direction,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Subgraph request failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.errors) {
          throw new Error(data.errors[0]?.message || "GraphQL error");
        }

        const rawGotchis = data.data?.aavegotchis || [];
        let gotchisWithListings = applyListingsToGotchis(rawGotchis.map(transformGotchi));
        
        // Apply client-side filters for things server can't handle
        if (hasClientSideFilters(filters)) {
          gotchisWithListings = applyClientSideFilters(gotchisWithListings, filters);
        }
        
        setGotchis(gotchisWithListings);
        setHasMore(rawGotchis.length >= batchSize);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gotchis");
    } finally {
      setLoading(false);
    }
  }, [client, mode, effectiveOwner, batchSize, sort, filters]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const usesBaazaarSource = mode === "baazaar" || sort.field === "price" || filters.priceMin || filters.priceMax;
    if (mode !== "all" && !usesBaazaarSource) return;

    setLoading(true);
    try {
      if (usesBaazaarSource) {
        const baazaarOrderBy = getBaazaarOrderBy(sort.field);
        const baazaarDirection = (sort.field === "price" || sort.field === "listingCreated") ? sort.direction : "desc";
        const response = await fetch(BAAZAAR_SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: BAAZAAR_GOTCHI_LISTINGS_QUERY,
            variables: { first: batchSize, skip: gotchis.length, orderBy: baazaarOrderBy, orderDirection: baazaarDirection },
          }),
        });

        if (!response.ok) {
          throw new Error(`Baazaar request failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.errors) {
          throw new Error(data.errors[0]?.message || "GraphQL error");
        }

        const listings = data.data?.erc721Listings || [];
        const newGotchis = listings
          .filter((l: any) => l.gotchi)
          .map((l: any) => {
            const g = transformGotchi(l.gotchi);
            g.listing = {
              id: l.id,
              priceInWei: l.priceInWei,
              seller: l.seller,
              timeCreated: l.timeCreated,
            };
            return g;
          });
        setGotchis((prev) => [...prev, ...newGotchis]);
        setHasMore(listings.length >= batchSize);
      } else {
        // Build where clause from filters for server-side filtering
        const whereClause = buildWhereClause(filters);
        const queryStr = buildGotchisQuery(whereClause);
        
        const response = await fetch("https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: queryStr,
            variables: {
              first: batchSize,
              skip: gotchis.length,
              orderBy: getSubgraphOrderBy(sort.field),
              orderDirection: sort.direction,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Subgraph request failed: ${response.status}`);
        }

        const data = await response.json();
        if (data.errors) {
          throw new Error(data.errors[0]?.message || "GraphQL error");
        }

        const rawGotchis = data.data?.aavegotchis || [];
        let newGotchis = applyListingsToGotchis(rawGotchis.map(transformGotchi));
        
        // Apply client-side filters for things server can't handle
        if (hasClientSideFilters(filters)) {
          newGotchis = applyClientSideFilters(newGotchis, filters);
        }
        
        setGotchis((prev) => [...prev, ...newGotchis]);
        setHasMore(rawGotchis.length >= batchSize);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }, [client, loading, hasMore, mode, gotchis.length, batchSize, sort, filters]);

  useEffect(() => {
    setGotchis([]);
    setHasMore(true);
    setSort({ field: "rarity", direction: "desc" });
    loadInitial();
  }, [mode]);

  // Debounced refetch when filters change (only for "all" mode with server-side filters)
  const filtersKey = useMemo(() => {
    // Create a stable key for filters that affect server-side queries
    return JSON.stringify({
      tokenId: filters.tokenId,
      tokenIdMin: filters.tokenIdMin,
      tokenIdMax: filters.tokenIdMax,
      nameContains: filters.nameContains,
      ownerAddress: filters.ownerAddress,
      rarityMin: filters.rarityMin,
      rarityMax: filters.rarityMax,
      levelMin: filters.levelMin,
      levelMax: filters.levelMax,
      haunts: filters.haunts.length === 1 ? filters.haunts[0] : "",
      hasGhstPocket: filters.hasGhstPocket === true ? true : "",
      ghstBalanceMin: filters.ghstBalanceMin,
      ghstBalanceMax: filters.ghstBalanceMax,
      hasEquippedSet: filters.hasEquippedSet === true ? true : "",
      equippedSets: filters.equippedSets.length === 1 ? filters.equippedSets[0] : "",
    });
  }, [filters]);

  // Keep ref updated with latest loadInitial
  loadInitialRef.current = loadInitial;
  
  useEffect(() => {
    // Skip initial render - the mode useEffect handles that
    if (isInitialFilterRender.current) {
      isInitialFilterRender.current = false;
      prevFiltersKey.current = filtersKey;
      return;
    }
    
    // Skip if filters haven't actually changed
    if (filtersKey === prevFiltersKey.current) return;
    prevFiltersKey.current = filtersKey;
    
    // Only refetch for "all" mode when server-side filters change
    if (mode !== "all") return;
    
    const timeout = setTimeout(() => {
      setGotchis([]);
      setHasMore(true);
      loadInitialRef.current();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeout);
  }, [filtersKey, mode]);

  const filteredGotchis = useMemo(() => {
    return applyFilters(gotchis, filters);
  }, [gotchis, filters]);

  const sortedGotchis = useMemo(() => {
    return applySorts(filteredGotchis, sort);
  }, [filteredGotchis, sort]);

  return {
    gotchis: sortedGotchis,
    allGotchis: gotchis,
    loading,
    hasMore,
    error,
    loadMore,
    filters,
    setFilters,
    sort,
    setSort,
    refresh: loadInitial,
  };
}
