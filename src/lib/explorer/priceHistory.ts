import { CORE_SUBGRAPH } from "@/lib/subgraph";

export type PriceHistory = { pricesGhst: number[]; timesTraded: number };
export type PriceHistoryKind = "gotchi" | "portal" | "parcel";

const ENTITY_BY_KIND: Record<PriceHistoryKind, string> = {
  gotchi: "aavegotchi",
  portal: "portal",
  parcel: "parcel",
};

/** Lifetime sale-price history + trade count for a gotchi, portal, or parcel. */
export async function fetchPriceHistory(kind: PriceHistoryKind, tokenId: string): Promise<PriceHistory | null> {
  const entity = ENTITY_BY_KIND[kind];
  const q = `query($id: ID!){ ${entity}(id: $id){ historicalPrices timesTraded } }`;
  const res = await fetch(CORE_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, variables: { id: tokenId } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");

  const data = json.data?.[entity];
  const historicalPrices: string[] | undefined = data?.historicalPrices;
  if (!data || !historicalPrices || historicalPrices.length === 0) return null;

  return {
    pricesGhst: historicalPrices.map((wei: string) => Number(wei) / 1e18),
    timesTraded: Number(data.timesTraded ?? 0),
  };
}
