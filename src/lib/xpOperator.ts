/**
 * XP-drop operator helpers (prepare-only).
 *
 * This is the "step prior to approval": it assembles and validates an XP drop
 * so a permitted signer (the DAO multisig holding the gameManager role) can
 * approve it. NOTHING here broadcasts. Creating a drop is `batchCreateXPDrop`
 * on MerkleDropFacet, gated by `onlyOwnerOrDaoOrGameManager` — so this module
 * only encodes the calldata / Safe transaction and reads the on-chain state to
 * verify a generated root; it never sends a transaction.
 */
import { encodeFunctionData } from "viem";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";

export const SIGPROP_XP = 10;
export const COREPROP_XP = 20;
const ZERO_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** A drop pending deployment, produced by the (backend) merkle pipeline. */
export type PendingXpDrop = {
  agip: number;
  title: string;
  sigpropId: string;
  corepropId: string;
  /** Generated merkle roots; empty until the pipeline has run. */
  sigpropRoot?: string;
  corepropRoot?: string;
  /** Eligible address counts (informational). */
  sigpropCount?: number;
  corepropCount?: number;
};

/** One (propId, root, xp) row for `batchCreateXPDrop`. */
export type CreateEntry = { propId: string; root: string; xpAmount: number };

/** batchCreateXPDrop(bytes32[] propIds, bytes32[] roots, uint256[] xp) — gated. */
export const BATCH_CREATE_XP_ABI = [
  {
    name: "batchCreateXPDrop",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_propId", type: "bytes32[]" },
      { name: "_merkleRoot", type: "bytes32[]" },
      { name: "_xpAmount", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

/** viewXPDrop(bytes32) -> (bytes32 root, uint256 xpAmount). Read-only. */
export const VIEW_XP_DROP_ABI = [
  {
    name: "viewXPDrop",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_propId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          { name: "xpAmount", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/** True when two roots refer to the same tree (case-insensitive, non-zero). */
export function rootMatches(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (la === ZERO_ROOT || lb === ZERO_ROOT) return false;
  return la === lb;
}

/** A drop is live on-chain once its stored xpAmount is non-zero. */
export function isDeployed(onchain: { root: string; xpAmount: bigint }): boolean {
  return onchain.xpAmount > 0n;
}

/** Expand an AGIP pair into the two create rows (sigprop 10 XP, coreprop 20 XP). */
export function pairToEntries(drop: PendingXpDrop): CreateEntry[] {
  const out: CreateEntry[] = [];
  if (drop.sigpropRoot) out.push({ propId: drop.sigpropId, root: drop.sigpropRoot, xpAmount: SIGPROP_XP });
  if (drop.corepropRoot) out.push({ propId: drop.corepropId, root: drop.corepropRoot, xpAmount: COREPROP_XP });
  return out;
}

export type PreparedCreateTx = {
  /** Encoded calldata for batchCreateXPDrop. */
  data: `0x${string}`;
  /** Minimal Safe transaction object to import into the multisig. */
  safeTx: { to: string; value: string; data: string; operation: 0 };
  entries: CreateEntry[];
};

/**
 * Encode the (unsigned) `batchCreateXPDrop` transaction for a set of entries.
 * Pure: returns calldata + a Safe-importable object. Broadcasting is the
 * multisig's job — this never sends anything.
 */
export function encodeCreateTx(entries: CreateEntry[]): PreparedCreateTx {
  const data = encodeFunctionData({
    abi: BATCH_CREATE_XP_ABI,
    functionName: "batchCreateXPDrop",
    args: [
      entries.map((e) => e.propId as `0x${string}`),
      entries.map((e) => e.root as `0x${string}`),
      entries.map((e) => BigInt(e.xpAmount)),
    ],
  });
  return {
    data,
    safeTx: { to: AAVEGOTCHI_DIAMOND_BASE, value: "0", data, operation: 0 },
    entries,
  };
}

/**
 * Pending drops awaiting deployment. STUB: the real source is an operator
 * backend that runs the aavegotchi-base pipeline (Snapshot sigprop/coreprop
 * pairing + merkle generation). Until that endpoint exists this returns [] so
 * the Admin section renders its manual validate/encode tools with an empty
 * pending list — nothing here is broadcast.
 */
export async function fetchPendingXpDrops(fetchImpl: typeof fetch = fetch): Promise<PendingXpDrop[]> {
  try {
    const res = await fetchImpl("/api/admin/xp-drops/pending");
    if (!res.ok) return [];
    return (await res.json()) as PendingXpDrop[];
  } catch {
    return [];
  }
}
