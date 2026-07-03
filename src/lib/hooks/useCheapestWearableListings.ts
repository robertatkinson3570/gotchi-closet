import { useQuery } from "@tanstack/react-query";

import { CORE_SUBGRAPH_URL } from "@/lib/lending/contracts";
import { coreSubgraphFetch } from "@/lib/subgraph";

export type WearableListing = { listingId: string; wearableId: number; priceInWei: string };

/** Cheapest active Baazaar listing per wearable id. staleTime 0 — save flows must not act on stale prices. */
export function useCheapestWearableListings(wearableIds: number[], enabled: boolean) {
  const key = [...wearableIds].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["cheapest-wearable-listings", key],
    enabled: enabled && wearableIds.length > 0,
    staleTime: 0,
    gcTime: 30_000,
    queryFn: async (): Promise<Record<number, WearableListing>> => {
      // One aliased query per id keeps it a single round trip. Where-clause
      // mirrors the repo's working listing queries (baazaar.ts / MarketGrid.tsx):
      // category 0 = wearables, open = { cancelled: false, sold: false, quantity_gt: 0 }.
      const parts = wearableIds.map(
        (id, i) =>
          `l${i}: erc1155Listings(first: 1, orderBy: priceInWei, orderDirection: asc,
             where: { erc1155TypeId: "${id}", category: 0, cancelled: false, sold: false, quantity_gt: 0 }) {
             id erc1155TypeId priceInWei quantity }`
      );
      const res = await coreSubgraphFetch(CORE_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ ${parts.join("\n")} }` }),
      });
      if (!res.ok) throw new Error(`Subgraph request failed: ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
      const out: Record<number, WearableListing> = {};
      wearableIds.forEach((id, i) => {
        const row = json.data?.[`l${i}`]?.[0];
        if (row && Number(row.quantity) > 0) {
          out[id] = { listingId: row.id, wearableId: id, priceInWei: row.priceInWei };
        }
      });
      return out;
    },
  });
}
