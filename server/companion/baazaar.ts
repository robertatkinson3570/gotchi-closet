import { subgraphFetch } from "../aavegotchi/subgraphFetch";

const CORE_SUBGRAPH =
  process.env.COMPANION_CORE_SUBGRAPH ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

// Cheapest OPEN gotchi listings (category 3 = gotchi, not cancelled, not yet purchased).
const QUERY = `query($first: Int!){
  erc721Listings(
    first: $first
    where: { category: 3, cancelled: false, timePurchased: "0" }
    orderBy: priceInWei
    orderDirection: asc
  ){
    priceInWei
    gotchi { name baseRarityScore withSetsRarityScore }
  }
}`;

function ghst(wei: string): number {
  try { return Number(BigInt(wei) / 10n ** 15n) / 1000; } catch { return 0; }
}

// A one-line summary of the current cheapest Baazaar gotchi listings + the best value by
// BRS-per-GHST, injected into chat context so Hermes can actually TELL the owner the deals
// instead of just navigating. null on failure.
export async function fetchBaazaarDeals(): Promise<string | null> {
  try {
    const res = await subgraphFetch({ query: QUERY, variables: { first: 8 } }, { primary: CORE_SUBGRAPH });
    if (!res.ok) return null;
    const json: any = await res.json();
    const rows: any[] = json?.data?.erc721Listings ?? [];
    if (!rows.length) return "There are no open gotchi listings on the Baazaar right now.";
    const items = rows.map((r) => {
      const price = ghst(r.priceInWei);
      const brs = Number(r.gotchi?.withSetsRarityScore ?? r.gotchi?.baseRarityScore ?? 0);
      return { name: r.gotchi?.name || "unnamed", price, brs, ppb: brs > 0 ? price / brs : Infinity };
    });
    const cheapest = items.slice(0, 5).map((i) => `${i.name} — ${i.price} GHST (BRS ${i.brs})`).join("; ");
    const best = [...items].filter((i) => Number.isFinite(i.ppb)).sort((a, b) => a.ppb - b.ppb)[0];
    const value = best ? ` Best value by BRS/GHST: ${best.name} at ${best.price} GHST (BRS ${best.brs}).` : "";
    return `Current cheapest open gotchi listings on the Baazaar: ${cheapest}.${value}`;
  } catch {
    return null;
  }
}
