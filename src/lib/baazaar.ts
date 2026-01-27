import { formatUnits } from "viem";

const BAAZAAR_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

export type BaazaarPriceMap = Record<
  number,
  {
    minPriceWei: bigint;
    minPriceGHST: string;
  }
>;

interface ERC1155Listing {
  erc1155TypeId: string;
  priceInWei: string;
  quantity: string;
}

const BAAZAAR_QUERY = `
  query BaazaarWearables($first: Int!, $skip: Int!) {
    erc1155Listings(
      first: $first
      skip: $skip
      where: {
        quantity_gt: 0
        category: 0
        sold: false
        cancelled: false
      }
      orderBy: priceInWei
      orderDirection: asc
    ) {
      erc1155TypeId
      priceInWei
      quantity
    }
  }
`;

let cachedPriceMap: BaazaarPriceMap | null = null;
let fetchPromise: Promise<BaazaarPriceMap> | null = null;

async function fetchAllListings(): Promise<ERC1155Listing[]> {
  const allListings: ERC1155Listing[] = [];
  const pageSize = 1000;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(BAAZAAR_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: BAAZAAR_QUERY,
        variables: { first: pageSize, skip },
      }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph request failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(data.errors[0]?.message || "GraphQL error");
    }

    const listings: ERC1155Listing[] = data.data?.erc1155Listings || [];
    allListings.push(...listings);

    if (listings.length < pageSize) {
      hasMore = false;
    } else {
      skip += pageSize;
    }

    if (skip > 10000) break;
  }

  return allListings;
}

function buildPriceMap(listings: ERC1155Listing[]): BaazaarPriceMap {
  const map: BaazaarPriceMap = {};

  for (const listing of listings) {
    const wearableId = parseInt(listing.erc1155TypeId, 10);
    if (isNaN(wearableId) || wearableId <= 0) continue;

    const priceWei = BigInt(listing.priceInWei);

    if (!map[wearableId] || priceWei < map[wearableId].minPriceWei) {
      map[wearableId] = {
        minPriceWei: priceWei,
        minPriceGHST: formatUnits(priceWei, 18),
      };
    }
  }

  return map;
}

export async function fetchBaazaarPrices(): Promise<BaazaarPriceMap> {
  if (cachedPriceMap) {
    return cachedPriceMap;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetchAllListings()
    .then((listings) => {
      cachedPriceMap = buildPriceMap(listings);
      return cachedPriceMap;
    })
    .catch((err) => {
      console.error("[Baazaar] Failed to fetch listings:", err);
      fetchPromise = null;
      return {} as BaazaarPriceMap;
    });

  return fetchPromise;
}

export function getCachedBaazaarPrices(): BaazaarPriceMap | null {
  return cachedPriceMap;
}

export function clearBaazaarCache(): void {
  cachedPriceMap = null;
  fetchPromise = null;
}
