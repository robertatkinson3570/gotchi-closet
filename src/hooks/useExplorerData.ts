import { useState, useEffect, useCallback, useMemo } from "react";
import { useClient } from "urql";
import { gql } from "urql";
import type { DataMode, ExplorerGotchi, ExplorerFilters, ExplorerSort, SortField } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { applyFilters } from "@/lib/explorer/filters";
import { applySorts } from "@/lib/explorer/sorts";

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

const GOTCHIS_PAGINATED = gql`
  query GotchisPaginated($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: String!) {
    aavegotchis(
      first: $first
      skip: $skip
      where: { status: 3 }
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
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
`;

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
        kinship
        experience
        escrow
        equippedSetID
        equippedSetName
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
  
  if (gotchiCache.has(tokenId)) {
    return gotchiCache.get(tokenId)!;
  }
  
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
  
  gotchiCache.set(tokenId, gotchi);
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
        const result = await client.query(GOTCHIS_PAGINATED, {
          first: batchSize,
          skip: 0,
          orderBy: getSubgraphOrderBy(sort.field),
          orderDirection: sort.direction,
        }).toPromise();

        if (result.error) {
          throw new Error(result.error.message);
        }

        const rawGotchis = result.data?.aavegotchis || [];
        const gotchisWithListings = applyListingsToGotchis(rawGotchis.map(transformGotchi));
        setGotchis(gotchisWithListings);
        setHasMore(rawGotchis.length >= batchSize);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gotchis");
    } finally {
      setLoading(false);
    }
  }, [client, mode, effectiveOwner, batchSize, sort, filters.priceMin, filters.priceMax]);

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
        const result = await client.query(GOTCHIS_PAGINATED, {
          first: batchSize,
          skip: gotchis.length,
          orderBy: getSubgraphOrderBy(sort.field),
          orderDirection: sort.direction,
        }).toPromise();

        if (result.error) {
          throw new Error(result.error.message);
        }

        const rawGotchis = result.data?.aavegotchis || [];
        const newGotchis = applyListingsToGotchis(rawGotchis.map(transformGotchi));
        setGotchis((prev) => [...prev, ...newGotchis]);
        setHasMore(rawGotchis.length >= batchSize);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }, [client, loading, hasMore, mode, gotchis.length, batchSize, sort, filters.priceMin, filters.priceMax]);

  useEffect(() => {
    setGotchis([]);
    setHasMore(true);
    setSort({ field: "rarity", direction: "desc" });
    loadInitial();
  }, [mode]);

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
