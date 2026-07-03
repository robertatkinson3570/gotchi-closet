/**
 * Pulse network fetchers. Shapes verified live 2026-07-02:
 * subgraph sale feeds (core + GBM), DefiLlama daily GHST price, Base RPC
 * supply, Blockscout holder counter, cheapest active gotchi listing.
 */
import { createPublicClient, fallback, http, erc20Abi, formatEther } from "viem";
import { base } from "viem/chains";
import { subgraphFetch } from "../aavegotchi/subgraphFetch";
import { GBM_SUBGRAPH, GOTCHIVERSE_SUBGRAPH } from "../../src/lib/subgraph";
import { getQuorumReport } from "../dao/quorum";
import {
  dayKey, type EngagementRow, type LendingRow, type MetricRow, type ProposalRow, type SaleCat, type SaleRow,
} from "../../src/lib/pulse/aggregate";

const GHST = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;
const RPC_URLS = ["https://mainnet.base.org", "https://base.llamarpc.com", "https://base.drpc.org"];
const PAGE = 1000;
const MAX_PAGES = 500;

const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((u) => http(u, { retryCount: 1, timeout: 15_000 }))),
});

async function gql(query: string, endpoint?: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = endpoint
        ? await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })
        : await subgraphFetch({ query }); // core subgraph with failover
      if (!res.ok) throw new Error(`subgraph ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
      return json.data;
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

function cat721(c: number): SaleCat { return c === 3 ? "gotchis" : c === 4 ? "parcels" : "other"; }
function cat1155(c: number): SaleCat { return c === 0 ? "wearables" : "other"; }

/** Timestamp-cursor walk over a settled feed until a short page. */
async function walk(fetchPage: (cursor: number) => Promise<SaleRow[]>): Promise<SaleRow[]> {
  let cursor = 0;
  const out: SaleRow[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const rows = await fetchPage(cursor);
    out.push(...rows);
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1].t;
  }
  return out;
}

export async function fetchSales721(startTs: number, endTs: number): Promise<SaleRow[]> {
  return walk(async (cursor) => {
    const d = await gql(
      `{ erc721Listings(first: ${PAGE}, where: { timePurchased_gt: "${Math.max(startTs, cursor)}", timePurchased_lt: "${endTs}" }, orderBy: timePurchased, orderDirection: asc) { priceInWei category timePurchased buyer seller } }`
    );
    return (d?.erc721Listings ?? []).map((r: any): SaleRow => ({
      t: Number(r.timePurchased),
      ghst: Number(r.priceInWei) / 1e18,
      cat: cat721(Number(r.category)),
      buyer: r.buyer ?? "",
      seller: r.seller ?? "",
    }));
  });
}

export async function fetchSales1155(startTs: number, endTs: number): Promise<SaleRow[]> {
  return walk(async (cursor) => {
    const d = await gql(
      `{ erc1155Purchases(first: ${PAGE}, where: { timeLastPurchased_gt: "${Math.max(startTs, cursor)}", timeLastPurchased_lt: "${endTs}" }, orderBy: timeLastPurchased, orderDirection: asc) { priceInWei quantity category timeLastPurchased buyer seller } }`
    );
    return (d?.erc1155Purchases ?? []).map((r: any): SaleRow => ({
      t: Number(r.timeLastPurchased),
      ghst: (Number(r.priceInWei) / 1e18) * Number(r.quantity ?? 1),
      cat: cat1155(Number(r.category)),
      buyer: r.buyer ?? "",
      seller: r.seller ?? "",
    }));
  });
}

export async function fetchSalesGbm(startTs: number, endTs: number): Promise<SaleRow[]> {
  return walk(async (cursor) => {
    const d = await gql(
      `{ auctions(first: ${PAGE}, where: { endsAt_gt: "${Math.max(startTs, cursor)}", endsAt_lt: "${endTs}", cancelled: false, highestBid_gt: "0" }, orderBy: endsAt, orderDirection: asc) { highestBid highestBidder seller category endsAt type } }`,
      GBM_SUBGRAPH
    );
    return (d?.auctions ?? []).map((r: any): SaleRow => ({
      t: Number(r.endsAt),
      ghst: Number(r.highestBid) / 1e18,
      cat: r.type === "erc1155" ? cat1155(Number(r.category)) : cat721(Number(r.category)),
      buyer: r.highestBidder ?? "",
      seller: r.seller ?? "",
    }));
  });
}

/** Summon timestamps (claimedTime, unix seconds) for claimed gotchis in [startTs, endTs). */
export async function fetchClaims(startTs: number, endTs: number): Promise<number[]> {
  const out: number[] = [];
  let cursor = startTs;
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql(
      `{ aavegotchis(first: ${PAGE}, where: { status: 3, claimedTime_gt: "${cursor}", claimedTime_lt: "${endTs}" }, orderBy: claimedTime, orderDirection: asc) { claimedTime } }`
    );
    const batch: { claimedTime: string }[] = d?.aavegotchis ?? [];
    for (const r of batch) out.push(Number(r.claimedTime));
    if (batch.length < PAGE) break;
    cursor = Number(batch[batch.length - 1].claimedTime);
  }
  return out;
}

/** Full scan of claimed gotchis: kinship + lastInteracted for the engagement snapshot. */
export async function fetchEngagementScan(): Promise<EngagementRow[]> {
  const out: EngagementRow[] = [];
  let cursor = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql(
      `{ aavegotchis(first: ${PAGE}, where: { status: 3, id_gt: "${cursor}" }, orderBy: id) { id kinship lastInteracted } }`
    );
    const batch: { id: string; kinship: string; lastInteracted: string }[] = d?.aavegotchis ?? [];
    for (const r of batch) out.push({ kinship: Number(r.kinship), lastInteracted: Number(r.lastInteracted) });
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].id;
  }
  return out;
}

/** Lending agreements (timeAgreed unix seconds) in [startTs, endTs). */
export async function fetchLendings(startTs: number, endTs: number): Promise<LendingRow[]> {
  const out: LendingRow[] = [];
  let cursor = startTs;
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql(
      `{ gotchiLendings(first: ${PAGE}, where: { timeAgreed_gt: "${cursor}", timeAgreed_lt: "${endTs}" }, orderBy: timeAgreed, orderDirection: asc) { timeAgreed upfrontCost borrower } }`
    );
    const batch: { timeAgreed: string; upfrontCost: string; borrower: string }[] = d?.gotchiLendings ?? [];
    for (const r of batch) {
      out.push({ t: Number(r.timeAgreed), upfrontGhst: Number(r.upfrontCost) / 1e18, borrower: r.borrower ?? "" });
    }
    if (batch.length < PAGE) break;
    cursor = Number(batch[batch.length - 1].timeAgreed);
  }
  return out;
}

/** All closed aavegotchi.eth Snapshot proposals ending after startTs. */
export async function fetchProposalsHistory(startTs: number): Promise<ProposalRow[]> {
  const out: ProposalRow[] = [];
  for (let skip = 0; skip < 5000; skip += 100) {
    const query = `{ proposals(first: 100, skip: ${skip}, where: { space: "aavegotchi.eth", state: "closed", end_gt: ${startTs} }, orderBy: "end", orderDirection: asc) { end votes scores_total } }`;
    const res = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`snapshot hub ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message ?? "snapshot error");
    const batch: { end: number; votes: number; scores_total: number }[] = json.data?.proposals ?? [];
    for (const p of batch) out.push({ end: Number(p.end), votes: Number(p.votes) || 0, scoresTotal: Number(p.scores_total) || 0 });
    if (batch.length < 100) break;
  }
  return out;
}

/** Count of gotchiverse gotchis that channeled alchemica within the last 7 days. */
export async function fetchChanneledCount(nowTs: number): Promise<MetricRow[]> {
  const since = nowTs - 7 * 86400;
  let count = 0;
  let cursor = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await gql(
      `{ gotchis(first: ${PAGE}, where: { lastChanneledAlchemica_gt: "${since}", id_gt: "${cursor}" }, orderBy: id) { id } }`,
      GOTCHIVERSE_SUBGRAPH
    );
    const batch: { id: string }[] = d?.gotchis ?? [];
    count += batch.length;
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].id;
  }
  return [{ day: dayKey(nowTs), metric: "gotchis_channeled_7d", value: count }];
}

/**
 * DAO health snapshots from the live-quorum service. getQuorumReport() only
 * *starts* a compute when cold, so wait (up to 10 min — a cold compute takes
 * ~5) for the report — else a nightly run would trigger the build, skip, and
 * never capture a value.
 */
export async function fetchDaoSnapshots(nowTs: number): Promise<MetricRow[]> {
  let report = getQuorumReport().report;
  for (let i = 0; !report && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    report = getQuorumReport().report;
  }
  if (!report) {
    console.warn("[pulse] quorum report unavailable — skipping DAO snapshots");
    return [];
  }
  const day = dayKey(nowTs);
  const treasury = report.excludedWallets
    .filter((w) => w.kind === "dao")
    .reduce((s, w) => s + w.ghst, 0);
  return [
    { day, metric: "quorum_total_vp", value: report.totalVp },
    { day, metric: "treasury_ghst", value: treasury },
  ];
}

/** Daily GHST/USD from DefiLlama, chunked ≤500 days per request. */
export async function fetchLlamaDaily(startTs: number): Promise<MetricRow[]> {
  const out: MetricRow[] = [];
  const now = Math.floor(Date.now() / 1000);
  let chunkStart = startTs;
  while (chunkStart < now) {
    const span = Math.min(500, Math.ceil((now - chunkStart) / 86400));
    if (span <= 0) break;
    const res = await fetch(`https://coins.llama.fi/chart/base:${GHST}?start=${chunkStart}&span=${span}&period=1d`);
    if (!res.ok) throw new Error(`llama ${res.status}`);
    const json = await res.json();
    const prices: { timestamp: number; price: number }[] = json?.coins?.[`base:${GHST}`]?.prices ?? [];
    for (const p of prices) out.push({ day: dayKey(p.timestamp), metric: "ghst_price_usd", value: p.price });
    chunkStart += span * 86400;
  }
  return out; // chunk-edge duplicates collapse in the upsert
}

/** Today's forward-accruing snapshots. Each source fails independently. */
export async function fetchSnapshots(): Promise<MetricRow[]> {
  const day = dayKey(Math.floor(Date.now() / 1000));
  const out: MetricRow[] = [];
  try {
    const supply = await client.readContract({ address: GHST, abi: erc20Abi, functionName: "totalSupply" });
    out.push({ day, metric: "ghst_supply", value: Number(formatEther(supply)) });
  } catch (err) {
    console.warn("[pulse] supply snapshot failed:", err);
  }
  try {
    const res = await fetch(`https://base.blockscout.com/api/v2/tokens/${GHST}/counters`);
    if (res.ok) {
      const j = await res.json();
      const n = Number(j?.token_holders_count);
      if (n > 0) out.push({ day, metric: "ghst_holders", value: n });
    }
  } catch (err) {
    console.warn("[pulse] holders snapshot failed:", err);
  }
  try {
    const d = await gql(
      `{ erc721Listings(first: 1, where: { cancelled: false, timePurchased: "0", category: "3", priceInWei_gt: "0" }, orderBy: priceInWei, orderDirection: asc) { priceInWei } }`
    );
    const wei = d?.erc721Listings?.[0]?.priceInWei;
    if (wei) out.push({ day, metric: "gotchi_floor_ghst", value: Number(wei) / 1e18 });
  } catch (err) {
    console.warn("[pulse] floor snapshot failed:", err);
  }
  return out;
}
