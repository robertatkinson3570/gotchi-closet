import { useState, useEffect, useCallback, useMemo } from "react";
import { useClient } from "urql";
import { gql } from "urql";
import type { DataMode, ExplorerGotchi, ExplorerFilters, ExplorerSort } from "@/lib/explorer/types";
import { defaultFilters } from "@/lib/explorer/types";
import { applyFilters } from "@/lib/explorer/filters";
import { applySorts } from "@/lib/explorer/sorts";

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
      }
    }
  }
`;

const gotchiCache = new Map<string, ExplorerGotchi>();

const BATCH_SIZE_MOBILE = 80;
const BATCH_SIZE_DESKTOP = 120;

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
    numericTraits: raw.numericTraits || [],
    modifiedNumericTraits: raw.modifiedNumericTraits || raw.numericTraits || [],
    withSetsNumericTraits: raw.withSetsNumericTraits || raw.modifiedNumericTraits || raw.numericTraits || [],
    equippedWearables: raw.equippedWearables || [],
    collateral: raw.collateral || "",
    owner: raw.owner?.id || "",
    kinship: raw.kinship,
    experience: raw.experience,
    listing: raw.listing,
  };
  
  gotchiCache.set(tokenId, gotchi);
  return gotchi;
}

export function useExplorerData(
  mode: DataMode,
  ownerAddress: string | null,
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

  const effectiveOwner = mode === "mine"
    ? (ownerAddress || connectedAddress)?.toLowerCase()
    : null;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGotchis([]);
    setHasMore(true);

    try {
      if (mode === "mine" && effectiveOwner) {
        const result = await client.query(GOTCHIS_BY_OWNER_EXPLORER, {
          owner: effectiveOwner,
        }).toPromise();

        if (result.error) {
          throw new Error(result.error.message);
        }

        const rawGotchis = result.data?.user?.gotchisOwned || [];
        setGotchis(rawGotchis.map(transformGotchi));
        setHasMore(false);
      } else if (mode === "all") {
        const result = await client.query(GOTCHIS_PAGINATED, {
          first: batchSize,
          skip: 0,
          orderBy: sort.field === "rarity" ? "withSetsRarityScore" : "gotchiId",
          orderDirection: sort.direction,
        }).toPromise();

        if (result.error) {
          throw new Error(result.error.message);
        }

        const rawGotchis = result.data?.aavegotchis || [];
        setGotchis(rawGotchis.map(transformGotchi));
        setHasMore(rawGotchis.length >= batchSize);
      } else {
        setGotchis([]);
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load gotchis");
    } finally {
      setLoading(false);
    }
  }, [client, mode, effectiveOwner, batchSize, sort]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || mode !== "all") return;

    setLoading(true);
    try {
      const result = await client.query(GOTCHIS_PAGINATED, {
        first: batchSize,
        skip: gotchis.length,
        orderBy: sort.field === "rarity" ? "withSetsRarityScore" : "gotchiId",
        orderDirection: sort.direction,
      }).toPromise();

      if (result.error) {
        throw new Error(result.error.message);
      }

      const rawGotchis = result.data?.aavegotchis || [];
      const newGotchis = rawGotchis.map(transformGotchi);
      setGotchis((prev) => [...prev, ...newGotchis]);
      setHasMore(rawGotchis.length >= batchSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }, [client, loading, hasMore, mode, gotchis.length, batchSize, sort]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

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
