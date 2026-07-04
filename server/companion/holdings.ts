import { subgraphFetch } from "../aavegotchi/subgraphFetch";

// Same Base core subgraph the companion already uses (with SUBGRAPH_URL_BACKUP failover).
const CORE_SUBGRAPH =
  process.env.COMPANION_CORE_SUBGRAPH ||
  "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

const QUERY = `query($owner: ID!){
  user(id: $owner){
    gotchisOwned{ name baseRarityScore withSetsRarityScore kinship level }
    gotchisLentOut
  }
}`;

// A one-line summary of the owner's Aavegotchi holdings, injected into chat context so Hermes
// answers "what's in my wallet / what do I own" from real on-chain data. null on any failure —
// the caller simply omits it. (Wallet-analysis + trading-strat skills build on this later.)
export async function fetchHoldingsSummary(owner: string): Promise<string | null> {
  try {
    const res = await subgraphFetch(
      { query: QUERY, variables: { owner: owner.toLowerCase() } },
      { primary: CORE_SUBGRAPH }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const g: any[] = json?.data?.user?.gotchisOwned ?? [];
    const lent = (json?.data?.user?.gotchisLentOut ?? []).length;
    if (!g.length && !lent) return "The owner holds no Aavegotchis in this wallet right now.";
    const names = g.map((x) => x.name || "unnamed").slice(0, 20).join(", ");
    const avgKin = g.length ? Math.round(g.reduce((s, x) => s + Number(x.kinship ?? 0), 0) / g.length) : 0;
    const topBrs = g.reduce((mx, x) => Math.max(mx, Number(x.withSetsRarityScore ?? x.baseRarityScore ?? 0)), 0);
    return `The owner owns ${g.length} Aavegotchi${g.length === 1 ? "" : "s"}${lent ? ` (plus ${lent} lent out)` : ""}: ${names}. Average kinship ~${avgKin}; highest BRS ~${topBrs}.`;
  } catch {
    return null;
  }
}
