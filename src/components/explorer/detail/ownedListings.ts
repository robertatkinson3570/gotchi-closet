import { CORE_SUBGRAPH, coreSubgraphFetch } from "@/lib/subgraph";

export type OwnedListing = { listingId: string; priceWei: string };
export type ListedMap = Record<string, OwnedListing>;

type Erc721Row = { id: string; tokenId: string; priceInWei: string };
type Erc1155Row = { id: string; erc1155TypeId: string; priceInWei: string };

/** Index the connected wallet's active listings by tokenId. First (newest) wins. */
export function buildListedMap(erc721: Erc721Row[], erc1155: Erc1155Row[]): ListedMap {
  const out: ListedMap = {};
  for (const l of erc721) if (!out[l.tokenId]) out[l.tokenId] = { listingId: l.id, priceWei: l.priceInWei };
  for (const l of erc1155) if (!out[l.erc1155TypeId]) out[l.erc1155TypeId] = { listingId: l.id, priceWei: l.priceInWei };
  return out;
}

/** The connected wallet's active listings for one category (erc721) or contract (erc1155). */
export async function fetchOwnedListings(
  kind: "erc721" | "erc1155",
  seller: string,
  category: number,
  tokenAddress: string,
): Promise<ListedMap> {
  const s = seller.toLowerCase();
  const query = kind === "erc721"
    ? `{ erc721Listings(first:1000, where:{ seller:"${s}", category:${category}, cancelled:false, timePurchased:"0" }, orderBy: timeCreated, orderDirection: desc){ id tokenId priceInWei } }`
    : `{ erc1155Listings(first:1000, where:{ seller:"${s}", erc1155TokenAddress:"${tokenAddress.toLowerCase()}", cancelled:false, sold:false, quantity_gt:0 }, orderBy: timeCreated, orderDirection: desc){ id erc1155TypeId priceInWei } }`;
  const res = await coreSubgraphFetch(CORE_SUBGRAPH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const j = await res.json();
  return kind === "erc721"
    ? buildListedMap(j.data?.erc721Listings ?? [], [])
    : buildListedMap([], j.data?.erc1155Listings ?? []);
}
