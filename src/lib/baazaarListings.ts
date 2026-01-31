/**
 * Baazaar Listing Fetcher
 * 
 * Centralized helper for fetching gotchi listings from the Aavegotchi Baazaar subgraph.
 * Entity and field names are isolated here for easy adjustment.
 */

import type { Gotchi } from "@/types";

const BAAZAAR_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

// Entity names (adjust if schema differs)
const LISTING_ENTITY = "erc721Listings";
const GOTCHI_ENTITY = "gotchi";

// Field names (adjust if schema differs)
const LISTING_FIELDS = {
  id: "id",
  tokenId: "tokenId",
  priceInWei: "priceInWei",
  seller: "seller",
  timeCreated: "timeCreated",
};

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
  stakedAmount
  equippedSetID
  equippedSetName
  createdAt
  lastInteracted
  usedSkillPoints
  minimumStake
`;

export type BaazaarListing = {
  listingId: string;
  tokenId: string;
  priceInWei: string;
  seller: string;
  timeCreated: string;
  gotchi: {
    id: string;
    gotchiId?: string;
    name: string;
    level?: number;
    numericTraits: number[];
    modifiedNumericTraits?: number[];
    withSetsNumericTraits?: number[];
    equippedWearables: number[];
    baseRarityScore?: number | null;
    modifiedRarityScore?: number | null;
    withSetsRarityScore?: number | null;
    hauntId?: number;
    collateral?: string;
    owner?: { id: string };
    kinship?: number;
    experience?: number;
    escrow?: string;
    stakedAmount?: string;
    equippedSetID?: string;
    equippedSetName?: string;
    createdAt?: number;
    lastInteracted?: number;
    usedSkillPoints?: number;
    minimumStake?: string;
  };
};

export type FetchListingsParams = {
  first: number;
  skip: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  filterTokenId?: string;
  filterSeller?: string;
};

export type FetchListingsResult = {
  listings: BaazaarListing[];
  hasMore: boolean;
};

/**
 * Fetch gotchi listings from Baazaar subgraph
 */
export async function fetchBaazaarListings(
  params: FetchListingsParams
): Promise<FetchListingsResult> {
  const {
    first,
    skip,
    orderBy = "timeCreated",
    orderDirection = "desc",
    filterTokenId,
    filterSeller,
  } = params;

  // Build where clause string for GraphQL query
  const whereParts: string[] = [];
  whereParts.push("category: 3");
  whereParts.push("cancelled: false");
  whereParts.push('timePurchased: "0"');
  
  if (filterTokenId && /^\d+$/.test(filterTokenId)) {
    whereParts.push(`tokenId: "${filterTokenId}"`);
  }
  
  if (filterSeller) {
    whereParts.push(`seller: "${filterSeller.toLowerCase()}"`);
  }
  
  const whereClause = `{ ${whereParts.join(", ")} }`;

  const query = `
    query BaazaarGotchiListings($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: OrderDirection!) {
      ${LISTING_ENTITY}(
        first: $first
        skip: $skip
        where: ${whereClause}
        orderBy: $orderBy
        orderDirection: $orderDirection
      ) {
        ${LISTING_FIELDS.id}
        ${LISTING_FIELDS.tokenId}
        ${LISTING_FIELDS.priceInWei}
        ${LISTING_FIELDS.seller}
        ${LISTING_FIELDS.timeCreated}
        ${GOTCHI_ENTITY} {
          ${GOTCHI_FIELDS}
        }
      }
    }
  `;

  const response = await fetch(BAAZAAR_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        first,
        skip,
        orderBy,
        orderDirection: orderDirection.toLowerCase() as "asc" | "desc",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Baazaar request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0]?.message || "GraphQL error");
  }

  const listings: BaazaarListing[] = (data.data?.[LISTING_ENTITY] || [])
    .filter((l: any) => l[GOTCHI_ENTITY]) // Only include listings with gotchi data
    .map((l: any) => ({
      listingId: l[LISTING_FIELDS.id],
      tokenId: l[LISTING_FIELDS.tokenId],
      priceInWei: l[LISTING_FIELDS.priceInWei],
      seller: l[LISTING_FIELDS.seller],
      timeCreated: l[LISTING_FIELDS.timeCreated],
      gotchi: l[GOTCHI_ENTITY],
    }));

  // Client-side filtering for tokenId partial match if needed
  let filteredListings = listings;
  if (filterTokenId && !/^\d+$/.test(filterTokenId)) {
    const normalized = filterTokenId.toLowerCase();
    filteredListings = listings.filter(
      (l) =>
        l.tokenId.toLowerCase().includes(normalized) ||
        l.gotchi.name.toLowerCase().includes(normalized)
    );
  }

  return {
    listings: filteredListings,
    hasMore: listings.length >= first,
  };
}

/**
 * Transform Baazaar listing to Gotchi format with market metadata
 */
export function transformBaazaarListingToGotchi(listing: BaazaarListing): Gotchi {
  const raw = listing.gotchi;
  const tokenId = String(raw.gotchiId || raw.id);
  
  // Normalize numericTraits to fixed 6-element array
  const rawTraits = raw.numericTraits || [];
  const normalizedTraits = new Array(6).fill(0);
  for (let i = 0; i < Math.min(6, rawTraits.length); i++) {
    const val = Number(rawTraits[i]);
    normalizedTraits[i] = Number.isFinite(val) ? val : 0;
  }
  
  // Normalize equippedWearables to fixed 16-element array
  const rawWearables = raw.equippedWearables || [];
  const normalizedWearables = new Array(16).fill(0);
  for (let i = 0; i < Math.min(16, rawWearables.length); i++) {
    const val = Number(rawWearables[i]);
    normalizedWearables[i] = Number.isFinite(val) ? val : 0;
  }
  
  // Normalize modifiedNumericTraits
  const rawModifiedTraits = raw.modifiedNumericTraits || raw.numericTraits || [];
  const normalizedModifiedTraits = new Array(6).fill(0);
  for (let i = 0; i < Math.min(6, rawModifiedTraits.length); i++) {
    const val = Number(rawModifiedTraits[i]);
    normalizedModifiedTraits[i] = Number.isFinite(val) ? val : 0;
  }
  
  // Normalize withSetsNumericTraits
  const rawWithSetsTraits = raw.withSetsNumericTraits || raw.modifiedNumericTraits || raw.numericTraits || [];
  const normalizedWithSetsTraits = new Array(6).fill(0);
  for (let i = 0; i < Math.min(6, rawWithSetsTraits.length); i++) {
    const val = Number(rawWithSetsTraits[i]);
    normalizedWithSetsTraits[i] = Number.isFinite(val) ? val : 0;
  }
  
  const gotchi: Gotchi = {
    id: raw.id,
    gotchiId: tokenId,
    name: raw.name || "",
    level: raw.level ? parseInt(String(raw.level), 10) : undefined,
    numericTraits: normalizedTraits,
    modifiedNumericTraits: normalizedModifiedTraits,
    withSetsNumericTraits: normalizedWithSetsTraits,
    equippedWearables: normalizedWearables,
    baseRarityScore: raw.baseRarityScore ? parseFloat(String(raw.baseRarityScore)) : null,
    usedSkillPoints: raw.usedSkillPoints ? parseInt(String(raw.usedSkillPoints), 10) : undefined,
    hauntId: raw.hauntId ? parseInt(String(raw.hauntId), 10) : undefined,
    collateral: (raw.collateral && typeof raw.collateral === "string" && raw.collateral.trim().startsWith("0x") && raw.collateral.trim().length >= 10)
      ? raw.collateral.trim()
      : undefined,
    createdAt: raw.createdAt ? parseInt(String(raw.createdAt), 10) : undefined,
    blocksElapsed: undefined, // Not available in Baazaar listing
    market: {
      source: "baazaar",
      listingId: listing.listingId,
      price: listing.priceInWei,
      currency: "GHST", // Baazaar uses GHST
      seller: listing.seller,
    },
  };
  
  return gotchi;
}
