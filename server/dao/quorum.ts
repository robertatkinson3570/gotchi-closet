/**
 * Live-quorum pipeline: computes DAO-wide votable voting power by porting the
 * four live aavegotchi.eth Snapshot strategies (see src/lib/quorumVp.ts).
 *
 * Data sources:
 *  - core-base subgraph: all summoned gotchis, wallet wearable balances
 *    (itemTypeOwnerships), REALM parcels
 *  - Base RPC (viem + multicall): GHST supply, excluded-wallet balances,
 *    GLTR-farm staked LP share per pool
 *  - Blockscout (best effort): GHST holder scan to split contract-held vs
 *    votable wallet GHST; falls back to supply-minus-exclusions
 *
 * A full recompute is a few hundred subgraph pages (~30-60s), so results are
 * cached in memory and refreshed in the background after REFRESH_MS.
 */
import { createPublicClient, fallback, http, erc20Abi, formatEther } from "viem";
import { base } from "viem/chains";
import { CORE_SUBGRAPH } from "../../src/lib/subgraph";
import {
  EXCLUDED_WALLETS,
  SNAPSHOT_QUORUM_VP,
  emptyBucket,
  excludedAddressSet,
  foldGotchiPage,
  foldItemOwnershipPage,
  foldParcelPage,
  type GhstHolderBreakdown,
  type GotchiRow,
  type ItemOwnershipRow,
  type ParcelRow,
  type QuorumReport,
  type VpBucket,
} from "../../src/lib/quorumVp";

const GHST = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB" as const;
const GLTR_FARM = "0xaB449DcA14413a6ae0bcea9Ea210B57aCe280d2c" as const;
/** LP pairs from the live aavegotchi-agip-37 strategy params on the space. */
const STAKED_LP_POOLS = [
  { label: "GHST/FUD", lp: "0xeae2fB93e291C2eB69195851813DE24f97f1ce71" },
  { label: "GHST/FOMO", lp: "0x62ab7d558A011237F8a57ac0F97601A764e85b88" },
  { label: "GHST/ALPHA", lp: "0x0Ba2A49aedf9A409DBB0272db7CDF98aEb1E1837" },
  { label: "GHST/KEK", lp: "0x699B4eb36b95cDF62c74f6322AaA140E7958Dc9f" },
  { label: "WETH/GHST", lp: "0x0DFb9Cb66A18468850d6216fCc691aa20ad1e091" },
  { label: "GHST/GLTR", lp: "0xa83b31D701633b8EdCfba55B93dDBC202D8A4621" },
] as const;

const RPC_URLS = ["https://mainnet.base.org", "https://base.llamarpc.com", "https://base.drpc.org"];
const BLOCKSCOUT_HOLDERS_URL = `https://base.blockscout.com/api/v2/tokens/${GHST}/holders`;
/** stop the holder scan once balances drop below this (GHST) — tail is votable dust */
const HOLDER_SCAN_FLOOR = 25;
const HOLDER_SCAN_MAX_PAGES = 80;
const PAGE_SIZE = 1000;
const REFRESH_MS = 30 * 60_000;

const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((url) => http(url, { retryCount: 1, timeout: 15_000 }))),
});

// ---------------------------------------------------------------------------
// Subgraph cursor pagination
// ---------------------------------------------------------------------------
async function subgraphPage<T>(query: string): Promise<T[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(CORE_SUBGRAPH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`subgraph ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
      const rows = Object.values(json.data ?? {})[0];
      return Array.isArray(rows) ? (rows as T[]) : [];
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Walks an entity with id_gt cursor pagination and folds each page into acc. */
async function scanEntity<T extends { id: string }>(
  buildQuery: (cursor: string) => string,
  fold: (rows: T[]) => void
): Promise<void> {
  let cursor = "";
  for (;;) {
    const rows = await subgraphPage<T>(buildQuery(cursor));
    if (rows.length === 0) return;
    fold(rows);
    if (rows.length < PAGE_SIZE) return;
    cursor = rows[rows.length - 1].id;
  }
}

// ---------------------------------------------------------------------------
// Component scans
// ---------------------------------------------------------------------------
async function scanGotchis(excluded: Set<string>): Promise<VpBucket> {
  const acc = emptyBucket();
  await scanEntity<GotchiRow & { id: string }>(
    (cursor) =>
      `{ aavegotchis(first: ${PAGE_SIZE}, orderBy: id, where: { status: 3, id_gt: "${cursor}" }) { id baseRarityScore equippedWearables originalOwner { id } } }`,
    (rows) => foldGotchiPage(acc, rows, excluded)
  );
  return acc;
}

async function scanWearables(excluded: Set<string>): Promise<VpBucket> {
  const acc = emptyBucket();
  await scanEntity<ItemOwnershipRow & { id: string }>(
    (cursor) =>
      `{ itemTypeOwnerships(first: ${PAGE_SIZE}, orderBy: id, where: { balance_gt: 0, id_gt: "${cursor}" }) { id owner balance itemType { id } } }`,
    (rows) => foldItemOwnershipPage(acc, rows, excluded)
  );
  return acc;
}

async function scanParcels(excluded: Set<string>): Promise<VpBucket> {
  const acc = emptyBucket();
  await scanEntity<ParcelRow & { id: string }>(
    (cursor) =>
      `{ parcels(first: ${PAGE_SIZE}, orderBy: id, where: { id_gt: "${cursor}" }) { id size owner { id } } }`,
    (rows) => foldParcelPage(acc, rows, excluded)
  );
  return acc;
}

// ---------------------------------------------------------------------------
// RPC reads
// ---------------------------------------------------------------------------
async function readGhstSupplyAndExcluded(): Promise<{
  totalSupply: number;
  excludedBalances: Map<string, number>;
}> {
  const calls = [
    { address: GHST, abi: erc20Abi, functionName: "totalSupply" } as const,
    ...EXCLUDED_WALLETS.map(
      (w) =>
        ({
          address: GHST,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [w.address as `0x${string}`],
        }) as const
    ),
  ];
  const results = await client.multicall({ contracts: calls, allowFailure: false });
  const totalSupply = Number(formatEther(results[0] as bigint));
  const excludedBalances = new Map<string, number>();
  EXCLUDED_WALLETS.forEach((w, i) => {
    excludedBalances.set(w.address, Number(formatEther(results[i + 1] as bigint)));
  });
  return { totalSupply, excludedBalances };
}

/** agip-37 aggregate: staked VP = Σ pools GHST-in-pair × farmLpBalance / lpSupply. */
async function readStakedLpVp(): Promise<{ vp: number; count: number }> {
  const calls = STAKED_LP_POOLS.flatMap(
    (pool) =>
      [
        { address: pool.lp as `0x${string}`, abi: erc20Abi, functionName: "totalSupply" },
        { address: GHST, abi: erc20Abi, functionName: "balanceOf", args: [pool.lp as `0x${string}`] },
        { address: pool.lp as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [GLTR_FARM] },
      ] as const
  );
  const results = await client.multicall({ contracts: calls, allowFailure: true });
  let vp = 0;
  let count = 0;
  for (let i = 0; i < STAKED_LP_POOLS.length; i++) {
    const [supply, ghstInPool, staked] = results.slice(i * 3, i * 3 + 3).map((r) =>
      r.status === "success" ? Number(formatEther(r.result as bigint)) : null
    );
    if (supply == null || ghstInPool == null || staked == null || supply <= 0) continue;
    vp += ghstInPool * (staked / supply);
    count += 1;
  }
  return { vp, count };
}

// ---------------------------------------------------------------------------
// GHST holder scan (Blockscout, best effort)
// ---------------------------------------------------------------------------
type BlockscoutHolder = {
  address: { hash: string; is_contract: boolean; name: string | null };
  value: string;
};

async function scanGhstHolders(
  totalSupply: number,
  excludedBalances: Map<string, number>
): Promise<GhstHolderBreakdown> {
  const excluded = excludedAddressSet();
  const daoControlled = EXCLUDED_WALLETS.filter((w) => w.kind === "dao").reduce(
    (s, w) => s + (excludedBalances.get(w.address) ?? 0),
    0
  );
  const infraContracts = EXCLUDED_WALLETS.filter((w) => w.kind === "infra").reduce(
    (s, w) => s + (excludedBalances.get(w.address) ?? 0),
    0
  );

  try {
    let otherContracts = 0;
    const topOther: { address: string; ghst: number }[] = [];
    let url = BLOCKSCOUT_HOLDERS_URL;
    for (let page = 0; page < HOLDER_SCAN_MAX_PAGES; page++) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`blockscout ${res.status}`);
      const json = (await res.json()) as {
        items: BlockscoutHolder[];
        next_page_params: Record<string, string | number> | null;
      };
      let belowFloor = false;
      for (const item of json.items ?? []) {
        const addr = item.address.hash.toLowerCase();
        const ghst = Number(item.value) / 1e18;
        if (ghst < HOLDER_SCAN_FLOOR) {
          belowFloor = true;
          break;
        }
        if (excluded.has(addr)) continue; // already bucketed via RPC balances
        if (!item.address.is_contract) continue; // EOA → votable
        // Safes can sign Snapshot votes (EIP-1271) → votable
        if ((item.address.name ?? "").toLowerCase().includes("safe")) continue;
        otherContracts += ghst;
        if (topOther.length < 8) topOther.push({ address: addr, ghst: Math.round(ghst) });
      }
      if (belowFloor || !json.next_page_params) break;
      const params = new URLSearchParams(
        Object.entries(json.next_page_params).map(([k, v]) => [k, String(v)])
      );
      url = `${BLOCKSCOUT_HOLDERS_URL}?${params}`;
    }
    const votable = Math.max(0, totalSupply - daoControlled - infraContracts - otherContracts);
    return {
      totalSupply,
      daoControlled,
      infraContracts,
      otherContracts,
      votable,
      method: "blockscout",
      topOtherContracts: topOther,
    };
  } catch (error) {
    console.warn("[quorum] blockscout holder scan failed, using supply-minus-exclusions:", error);
    const votable = Math.max(0, totalSupply - daoControlled - infraContracts);
    return {
      totalSupply,
      daoControlled,
      infraContracts,
      otherContracts: 0,
      votable,
      method: "supply-minus-exclusions",
      topOtherContracts: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Orchestration + cache
// ---------------------------------------------------------------------------
async function computeReport(): Promise<QuorumReport> {
  const excluded = excludedAddressSet();
  const [gotchis, wearables, realm, { totalSupply, excludedBalances }, stakedLp] =
    await Promise.all([
      scanGotchis(excluded),
      scanWearables(excluded),
      scanParcels(excluded),
      readGhstSupplyAndExcluded(),
      readStakedLpVp(),
    ]);
  const ghst = await scanGhstHolders(totalSupply, excludedBalances);

  const components: QuorumReport["components"] = {
    walletGhst: { vp: ghst.votable, excludedVp: totalSupply - ghst.votable, count: 0 },
    gotchis,
    wearables,
    realm,
    stakedLp: { vp: stakedLp.vp, excludedVp: 0, count: stakedLp.count },
  };
  const totalVp = Object.values(components).reduce((s, c) => s + c.vp, 0);

  return {
    updatedAt: Date.now(),
    totalVp,
    quorum: SNAPSHOT_QUORUM_VP,
    components,
    ghst,
    excludedWallets: EXCLUDED_WALLETS.map((w) => ({
      ...w,
      ghst: Math.round(excludedBalances.get(w.address) ?? 0),
    })),
    pending: [
      { label: "Aerodrome LP (unstaked)", note: "GHST inside Aerodrome pools earns no VP unless the LP is staked in the GLTR farm; a dedicated strategy is TBD." },
      { label: "Pocket GHST", note: "GHST held in Pocket escrow on Base is not covered by any live strategy yet." },
    ],
  };
}

let cached: QuorumReport | null = null;
let inflight: Promise<QuorumReport> | null = null;

function refresh(): Promise<QuorumReport> {
  if (!inflight) {
    inflight = computeReport()
      .then((report) => {
        cached = report;
        return report;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Returns the cached report immediately when available (kicking off a
 * background refresh if stale); `building: true` means no data yet — the
 * client should poll.
 */
export function getQuorumReport(): { report: QuorumReport | null; building: boolean } {
  const stale = !cached || Date.now() - cached.updatedAt > REFRESH_MS;
  if (stale) {
    refresh().catch((error) => console.error("[quorum] recompute failed:", error));
  }
  return { report: cached, building: !cached };
}
