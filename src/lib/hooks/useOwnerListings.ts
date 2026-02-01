import { useQuery } from "@tanstack/react-query";
import { fetchBaazaarListings } from "@/lib/baazaarListings";

export type ListingPriceMap = Record<string, string>;

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
