/**
 * XP-drop claim resolution.
 *
 * The diamond stores only each drop's merkle root; the actual eligibility tree
 * (addresses, their gotchi ids, and proofs) lives off-chain in the public
 * aavegotchi-base repo at
 *   scripts/airdrops/xpDrops/base/<propId>/{tree.json,data.json}
 * where <propId> is the on-chain drop id (== the xp subgraph `xpdrop.id`).
 *
 * To claim XP for a gotchi we must find the leaf that committed it. A leaf is
 * keccak256(abi.encodePacked(claimer, gotchiIds)) — the claimer is the address
 * that HELD the gotchis at the proposal's snapshot block (the tree key), not
 * necessarily today's owner. XP credits to the gotchi id regardless of who holds
 * it now, and anyone may submit the tx (the contract does not check msg.sender).
 *
 * This module is pure/injectable so the join logic is unit-tested without any
 * network or chain access. Nothing here signs or sends a transaction; it only
 * assembles the arguments a wallet would pass to `claimXPDrop`.
 */

/** data.json: address -> { address, gotchiIds } (order is significant). */
export type XpDropData = Record<string, { address: string; gotchiIds: string[] }>;
/** tree.json: address -> { leaf, proof }. */
export type XpDropTree = Record<string, { leaf: string; proof: string[] }>;

/** Everything needed to build a claim for one gotchi against one drop. */
export type GotchiClaim = {
  propId: string;
  /** Address the leaf was built for (snapshot-time holder); pass verbatim. */
  claimer: string;
  /** Full gotchi-id list of that leaf, in original order (leaf preimage). */
  gotchiIds: string[];
  proof: string[];
};

/** ABI for the permissionless claim entrypoint on MerkleDropFacet. */
export const CLAIM_XP_ABI = [
  {
    name: "claimXPDrop",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_propId", type: "bytes32" },
      { name: "_claimer", type: "address" },
      { name: "_gotchiId", type: "uint256[]" },
      { name: "_proof", type: "bytes32[]" },
      { name: "_onlyGotchis", type: "uint256[]" },
      { name: "_onlyGotchisPositions", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const RAW_BASE =
  "https://raw.githubusercontent.com/aavegotchi/aavegotchi-base/master/scripts/airdrops/xpDrops/base";

export function dropFileUrl(propId: string, file: "tree.json" | "data.json"): string {
  return `${RAW_BASE}/${propId.toLowerCase()}/${file}`;
}

/**
 * Find the leaf in data.json whose gotchi list contains `gotchiId`. Gotchi ids
 * are compared as strings; leaf order is preserved (it is the merkle preimage).
 * Returns the leaf's claimer address and full gotchi-id list, or null.
 */
export function findGotchiLeaf(
  data: XpDropData,
  gotchiId: string
): { claimer: string; gotchiIds: string[] } | null {
  const target = String(gotchiId);
  for (const entry of Object.values(data)) {
    if (entry.gotchiIds.some((g) => String(g) === target)) {
      return { claimer: entry.address, gotchiIds: entry.gotchiIds };
    }
  }
  return null;
}

/**
 * Assemble the `claimXPDrop` argument tuple. Passing the full gotchi-id list
 * with empty _onlyGotchis claims every not-yet-claimed gotchi in the leaf in one
 * call (the contract skips already-claimed ids). Gotchi ids become bigint for
 * the uint256[] param; the proof and claimer pass through unchanged.
 */
export function buildClaimArgs(
  claim: GotchiClaim
): readonly [`0x${string}`, `0x${string}`, bigint[], `0x${string}`[], bigint[], bigint[]] {
  return [
    claim.propId as `0x${string}`,
    claim.claimer as `0x${string}`,
    claim.gotchiIds.map((g) => BigInt(g)),
    claim.proof as `0x${string}`[],
    [],
    [],
  ] as const;
}

/**
 * Fetch a drop's data + tree from the aavegotchi-base repo and resolve the
 * claim for one gotchi. `fetchImpl` is injectable for tests. Returns null when
 * the gotchi is not in this drop's tree (i.e. it was not eligible).
 */
export async function resolveGotchiClaim(
  propId: string,
  gotchiId: string,
  fetchImpl: typeof fetch = fetch
): Promise<GotchiClaim | null> {
  const [dataRes, treeRes] = await Promise.all([
    fetchImpl(dropFileUrl(propId, "data.json")),
    fetchImpl(dropFileUrl(propId, "tree.json")),
  ]);
  if (!dataRes.ok || !treeRes.ok) return null;

  const data = (await dataRes.json()) as XpDropData;
  const tree = (await treeRes.json()) as XpDropTree;

  const leaf = findGotchiLeaf(data, gotchiId);
  if (!leaf) return null;

  // tree.json is keyed by the same address as data.json.
  const proofEntry = tree[leaf.claimer] ?? tree[leaf.claimer.toLowerCase()];
  if (!proofEntry) return null;

  return { propId, claimer: leaf.claimer, gotchiIds: leaf.gotchiIds, proof: proofEntry.proof };
}

// ---------------------------------------------------------------------------
// Address-keyed resolution (the dapp "airdrops" model): a wallet claims the XP
// for every gotchi it held at snapshot in one leaf, keyed by its own address.
// ---------------------------------------------------------------------------

/** ABI for the batched multi-drop claim entrypoint on MerkleDropFacet. */
export const BATCH_CLAIM_XP_ABI = [
  {
    name: "batchDropClaimXPDrop",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_propIds", type: "bytes32[]" },
      { name: "_claimers", type: "address[]" },
      { name: "_gotchiIds", type: "uint256[][]" },
      { name: "_proofs", type: "bytes32[][]" },
      { name: "_onlyGotchis", type: "uint256[][]" },
      { name: "_onlyGotchisPositions", type: "uint256[][]" },
    ],
    outputs: [],
  },
] as const;

/** Look up an address's leaf entry. data.json keys are lowercased. */
export function getAddressEntry(
  data: XpDropData,
  address: string
): { claimer: string; gotchiIds: string[] } | null {
  const entry = data[address] ?? data[address.toLowerCase()];
  if (!entry) return null;
  return { claimer: entry.address, gotchiIds: entry.gotchiIds };
}

/** Fetch a drop's data.json (address -> gotchi list). Null on a missing file. */
export async function fetchDropData(
  propId: string,
  fetchImpl: typeof fetch = fetch
): Promise<XpDropData | null> {
  const res = await fetchImpl(dropFileUrl(propId, "data.json"));
  if (!res.ok) return null;
  return (await res.json()) as XpDropData;
}

/** Fetch a drop's tree.json (address -> proof). Null on a missing file. */
export async function fetchDropTree(
  propId: string,
  fetchImpl: typeof fetch = fetch
): Promise<XpDropTree | null> {
  const res = await fetchImpl(dropFileUrl(propId, "tree.json"));
  if (!res.ok) return null;
  return (await res.json()) as XpDropTree;
}

/**
 * Resolve a claim for one address against one drop. Returns the claimer, its
 * full gotchi list (the leaf preimage), and proof — or null if the address is
 * not in this drop's tree.
 */
export async function resolveAddressClaim(
  propId: string,
  address: string,
  fetchImpl: typeof fetch = fetch
): Promise<GotchiClaim | null> {
  const [data, tree] = await Promise.all([
    fetchDropData(propId, fetchImpl),
    fetchDropTree(propId, fetchImpl),
  ]);
  if (!data || !tree) return null;

  const entry = getAddressEntry(data, address);
  if (!entry) return null;

  const proofEntry =
    tree[entry.claimer] ?? tree[entry.claimer.toLowerCase()] ?? tree[address] ?? tree[address.toLowerCase()];
  if (!proofEntry) return null;

  return { propId, claimer: entry.claimer, gotchiIds: entry.gotchiIds, proof: proofEntry.proof };
}

/**
 * Assemble the `batchDropClaimXPDrop` argument tuple from many single-address
 * claims — one entry per drop, each claiming all of that drop's not-yet-claimed
 * gotchis for the address. Parallel arrays, same order.
 */
export function buildBatchClaimArgs(
  claims: GotchiClaim[]
): readonly [`0x${string}`[], `0x${string}`[], bigint[][], `0x${string}`[][], bigint[][], bigint[][]] {
  return [
    claims.map((c) => c.propId as `0x${string}`),
    claims.map((c) => c.claimer as `0x${string}`),
    claims.map((c) => c.gotchiIds.map((g) => BigInt(g))),
    claims.map((c) => c.proof as `0x${string}`[]),
    claims.map(() => [] as bigint[]),
    claims.map(() => [] as bigint[]),
  ] as const;
}
