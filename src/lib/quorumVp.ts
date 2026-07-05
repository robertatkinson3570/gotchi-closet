/**
 * AavegotchiDAO "live quorum" math — pure functions shared by the server
 * pipeline (server/dao/quorum.ts) and the DAO page UI.
 *
 * Ports the exact math of the four live strategies on the aavegotchi.eth
 * Snapshot space (verified against hub.snapshot.org space params, 2026-07-02):
 *   1. erc20-balance-of            — GHST on Base
 *   2. aavegotchi-agip             — gotchi BRS + equipped wearables + wallet wearables
 *   3. aavegotchi-agip-17          — REALM parcels by size
 *   4. aavegotchi-agip-37-…-lp     — GHST share of LP staked in the GLTR farm
 */
import { WEARABLE_VP } from "./quorumVpPrices";

/** Fixed quorum configured on the aavegotchi.eth space (space.voting.quorum). */
export const SNAPSHOT_QUORUM_VP = 7_200_000;

/** agip-17: VP per parcel `size` (0 humble, 1 reasonable, 2/3 spacious, 4 partner). */
export const REALM_SIZE_VP: Readonly<Record<number, number>> = {
  0: 32,
  1: 128,
  2: 1028,
  3: 1028,
  4: 2048,
};

export function wearableVp(itemId: number): number {
  return WEARABLE_VP[itemId] ?? 0;
}

/** aavegotchi-agip: a summoned gotchi's VP = BRS + Σ equipped wearable values. */
export function gotchiVp(baseRarityScore: number, equippedWearables: number[]): number {
  const brs = Number.isFinite(baseRarityScore) ? baseRarityScore : 0;
  return equippedWearables.reduce((sum, id) => sum + wearableVp(Number(id)), brs);
}

export function realmVp(size: number): number {
  return REALM_SIZE_VP[size] ?? 0;
}

// ---------------------------------------------------------------------------
// Wallets excluded from "votable VP" — DAO-controlled (AGIP-145 spirit) plus
// infrastructure contracts that hold assets but can never sign a vote.
// Every entry is labeled so the UI can show WHY it is excluded.
// ---------------------------------------------------------------------------
export type ExcludedWallet = {
  address: string;
  label: string;
  /** dao = DAO-controlled (excluded per AGIP-145); infra = contract that cannot vote */
  kind: "dao" | "infra";
};

export const EXCLUDED_WALLETS: ExcludedWallet[] = [
  // DAO-controlled (Base)
  { address: "0x62de034b1a69ef853c9d0d8a33d26df5cf26682e", label: "DAO Foundation Liquidity (Safe)", kind: "dao" },
  { address: "0x939b67f6f6be63e09b0258621c5a24eecb92631c", label: "DAO Foundation Treasury (Safe)", kind: "dao" },
  // Protocol escrow / infrastructure — holds assets, cannot vote
  { address: "0xa99c4b08201f2913db8d28e71d020c4298f29dbf", label: "Aavegotchi diamond (equipped wearables + Baazaar escrow)", kind: "infra" },
  { address: "0x50af2d63b839aa32b4166fd1cb247129b715186c", label: "Forge diamond (unminted forge stock)", kind: "infra" },
  { address: "0x80320a0000c7a6a34086e2acad6915ff57ffda31", label: "GBM auction escrow", kind: "infra" },
  { address: "0x4b0040c3646d3c44b8a28ad7055cfcf536c05372", label: "Realm diamond (parcel escrow)", kind: "infra" },
  { address: "0xab449dca14413a6ae0bcea9ea210b57ace280d2c", label: "GLTR farm (staked LP, VP counted via the Staked LP component)", kind: "infra" },
  // AMM pools holding GHST. LP'd GHST only earns VP via the staked-LP strategy,
  // so pool balances are excluded from wallet GHST to avoid double counting.
  { address: "0xeae2fb93e291c2eb69195851813de24f97f1ce71", label: "GHST/FUD pool", kind: "infra" },
  { address: "0x62ab7d558a011237f8a57ac0f97601a764e85b88", label: "GHST/FOMO pool", kind: "infra" },
  { address: "0x0ba2a49aedf9a409dbb0272db7cdf98aeb1e1837", label: "GHST/ALPHA pool", kind: "infra" },
  { address: "0x699b4eb36b95cdf62c74f6322aaa140e7958dc9f", label: "GHST/KEK pool", kind: "infra" },
  { address: "0x0dfb9cb66a18468850d6216fcc691aa20ad1e091", label: "Aerodrome WETH/GHST pool", kind: "infra" },
  { address: "0xa83b31d701633b8edcfba55b93ddbc202d8a4621", label: "GHST/GLTR pool", kind: "infra" },
  { address: "0x41d4934322f2bd6fe1dbe4124070fe61651a2067", label: "Aerodrome CL pool (GHST), no VP until an LP strategy is added", kind: "infra" },
];

export function excludedAddressSet(): Set<string> {
  return new Set(EXCLUDED_WALLETS.map((w) => w.address));
}

// ---------------------------------------------------------------------------
// Page folders — pure reducers over subgraph rows, unit-tested.
// Owners in `excluded` contribute to the per-bucket `excludedVp` instead of `vp`,
// so the report can show both votable VP and what was carved out.
// ---------------------------------------------------------------------------
export type VpBucket = { vp: number; excludedVp: number; count: number };

export type GotchiRow = {
  baseRarityScore: string | number;
  equippedWearables: (string | number)[];
  originalOwner?: { id: string } | null;
};

export function foldGotchiPage(acc: VpBucket, rows: GotchiRow[], excluded: Set<string>): VpBucket {
  for (const row of rows) {
    const vp = gotchiVp(Number(row.baseRarityScore), row.equippedWearables.map(Number));
    if (excluded.has(row.originalOwner?.id?.toLowerCase() ?? "")) acc.excludedVp += vp;
    else acc.vp += vp;
    acc.count += 1;
  }
  return acc;
}

export type ItemOwnershipRow = {
  balance: string | number;
  itemType: { id: string };
  owner: string;
};

export function foldItemOwnershipPage(
  acc: VpBucket,
  rows: ItemOwnershipRow[],
  excluded: Set<string>
): VpBucket {
  for (const row of rows) {
    const vp = Number(row.balance) * wearableVp(Number(row.itemType.id));
    if (!Number.isFinite(vp) || vp <= 0) continue;
    if (excluded.has(row.owner.toLowerCase())) acc.excludedVp += vp;
    else acc.vp += vp;
    acc.count += 1;
  }
  return acc;
}

export type ParcelRow = { size: string | number; owner?: { id: string } | null };

export function foldParcelPage(acc: VpBucket, rows: ParcelRow[], excluded: Set<string>): VpBucket {
  for (const row of rows) {
    const vp = realmVp(Number(row.size));
    if (excluded.has(row.owner?.id?.toLowerCase() ?? "")) acc.excludedVp += vp;
    else acc.vp += vp;
    acc.count += 1;
  }
  return acc;
}

export function emptyBucket(): VpBucket {
  return { vp: 0, excludedVp: 0, count: 0 };
}

// ---------------------------------------------------------------------------
// API payload (GET /api/dao/quorum)
// ---------------------------------------------------------------------------
export type GhstHolderBreakdown = {
  totalSupply: number;
  /** balances of kind:"dao" excluded wallets */
  daoControlled: number;
  /** balances of kind:"infra" excluded wallets (pools, escrow, farm) */
  infraContracts: number;
  /** other detected contract holders that are not Safes (cannot sign votes) */
  otherContracts: number;
  /** votable remainder: EOAs, Safes and the unscanned small-holder tail */
  votable: number;
  /** how the holder scan was done — "blockscout" or "supply-minus-exclusions" fallback */
  method: "blockscout" | "supply-minus-exclusions";
  /** largest unlabeled contract holders, surfaced for transparency */
  topOtherContracts: { address: string; ghst: number }[];
};

export type QuorumComponentKey = "walletGhst" | "gotchis" | "wearables" | "realm" | "stakedLp";

export type QuorumReport = {
  updatedAt: number;
  /** votable VP = Σ component vp (exclusions already carved out) */
  totalVp: number;
  quorum: number;
  components: Record<QuorumComponentKey, { vp: number; excludedVp: number; count: number }>;
  ghst: GhstHolderBreakdown;
  excludedWallets: (ExcludedWallet & { ghst: number })[];
  /** sources that grant no VP today but the DAO has discussed adding */
  pending: { label: string; note: string }[];
};
