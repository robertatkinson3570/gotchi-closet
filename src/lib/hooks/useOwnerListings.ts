import { useQuery, useQueries } from "@tanstack/react-query";
import { fetchBaazaarListings } from "@/lib/baazaarListings";

export type ListingPriceMap = Record<string, string>;

const BAAZAAR_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

async function fetchListingByTokenId(tokenId: string): Promise<{ tokenId: string; price: string | null }> {
  const query = `
    query GetListingByTokenId($tokenId: String!) {
      erc721Listings(
        first: 1
        where: { category: 3, cancelled: false, timePurchased: "0", tokenId: $tokenId }
        orderBy: timeCreated
        orderDirection: desc
      ) {
        priceInWei
      }
    }
  `;

  const response = await fetch(BAAZAAR_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { tokenId } }),
  });

  if (!response.ok) {
    return { tokenId, price: null };
  }

  const data = await response.json();
  const listing = data.data?.erc721Listings?.[0];
  return { tokenId, price: listing?.priceInWei || null };
}

async function fetchOwnerListingPrices(owner: string): Promise<ListingPriceMap> {
  const priceMap: ListingPriceMap = {};
  let skip = 0;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const { listings, hasMore: more } = await fetchBaazaarListings({
      first: pageSize,
      skip,
      filterSeller: owner,
    });

    for (const listing of listings) {
      const gotchiId = listing.gotchi?.gotchiId || listing.tokenId;
      if (gotchiId && listing.priceInWei) {
        priceMap[gotchiId] = listing.priceInWei;
      }
    }

    hasMore = more;
    skip += pageSize;

    if (skip > 500) break;
  }

  return priceMap;
}

export function useOwnerListings(owner: string | null | undefined) {
  return useQuery<ListingPriceMap>({
    queryKey: ["owner-listings", owner],
    queryFn: () => fetchOwnerListingPrices(owner as string),
    enabled: !!owner,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useGotchiListingPrices(tokenIds: string[]): ListingPriceMap {
  const queries = useQueries({
    queries: tokenIds.map((tokenId) => ({
      queryKey: ["gotchi-listing", tokenId],
      queryFn: () => fetchListingByTokenId(tokenId),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    })),
  });

  const priceMap: ListingPriceMap = {};
  for (const query of queries) {
    if (query.data?.price) {
      priceMap[query.data.tokenId] = query.data.price;
    }
  }
  return priceMap;
}
