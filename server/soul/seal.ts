// SPDX: MIT — server/soul/seal.ts
// EIP-712 attestation helpers for SoulSeal.sol (Phase 5).
// All exports degrade gracefully when env vars are missing.

import { createPublicClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SEAL_DOMAIN_NAME = "GotchiClosetSoulSeal";
const SEAL_VERSION = "1";
const BASE_CHAIN_ID = 8453;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SealPayload {
  tokenId: string;
  soulHash: `0x${string}`;
  depthBips: number;
  soulAgeDays: number;
  nonce: string;
}

// EIP-712 type definition (shared between sign & recover)
const SEAL_TYPES = {
  SealPayload: [
    { name: "tokenId",    type: "uint256" },
    { name: "soulHash",   type: "bytes32" },
    { name: "depthBips",  type: "uint16"  },
    { name: "soulAgeDays",type: "uint16"  },
    { name: "nonce",      type: "uint256" },
  ],
} as const;

// ABI for getSeal — returns a tuple matching SealRecord in the contract.
const GET_SEAL_ABI: Abi = [
  {
    name: "getSeal",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "soulHash",    type: "bytes32" },
          { name: "depthBips",   type: "uint16"  },
          { name: "soulAgeDays", type: "uint16"  },
          { name: "blockNumber", type: "uint256" },
          { name: "sealedBy",    type: "address" },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function getSealAddress(): string | undefined {
  const v = process.env.SOUL_SEAL_ADDRESS;
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function getAttestorKey(): string | undefined {
  const v = process.env.SOUL_ATTESTOR_KEY;
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function getBaseRpcUrl(): string {
  return (
    process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org"
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true iff both SOUL_SEAL_ADDRESS and SOUL_ATTESTOR_KEY are set.
 * When false, seal endpoints return 503 and no network calls are made.
 */
export function sealConfigured(): boolean {
  return !!(getSealAddress() && getAttestorKey());
}

/**
 * Build an EIP-712 attestation for a SealPayload.
 * Returns null when sealing is not configured (env vars missing).
 */
export async function buildSealAttestation(
  p: SealPayload
): Promise<{ payload: SealPayload; attestorSig: `0x${string}`; contract: string } | null> {
  const sealAddress = getSealAddress();
  const attestorKey  = getAttestorKey();
  if (!sealAddress || !attestorKey) return null;

  const account = privateKeyToAccount(attestorKey as `0x${string}`);

  const attestorSig = await account.signTypedData({
    domain: {
      name:              SEAL_DOMAIN_NAME,
      version:           SEAL_VERSION,
      chainId:           BASE_CHAIN_ID,
      verifyingContract: sealAddress as `0x${string}`,
    },
    types:       SEAL_TYPES,
    primaryType: "SealPayload",
    message: {
      tokenId:     BigInt(p.tokenId),
      soulHash:    p.soulHash,
      depthBips:   p.depthBips,
      soulAgeDays: p.soulAgeDays,
      nonce:       BigInt(p.nonce),
    },
  });

  return { payload: p, attestorSig, contract: sealAddress };
}

// ---------------------------------------------------------------------------
// On-chain seal read — singleton client + bounded RPC + monotonic cache
// ---------------------------------------------------------------------------

export interface OnChainSeal {
  soulHash: string;
  depthBips: number;
  soulAgeDays: number;
  blockNumber: number;
}

// One Base public client for the whole process, bounded so a degraded public RPC
// can never stall the GET /api/soul/:id hot path: 2.5s timeout, a single retry.
let _sealClient: ReturnType<typeof createPublicClient> | null = null;
function sealClient() {
  if (!_sealClient) {
    _sealClient = createPublicClient({
      chain:     base,
      transport: http(getBaseRpcUrl(), { timeout: 2500, retryCount: 1 }),
    });
  }
  return _sealClient;
}

// A seal is monotonic on-chain (once sealed, always sealed), so a positive read
// is cached for minutes to (a) remove per-request RPC cost on the hot path and
// (b) stop a lagging read-replica's blockNumber===0 from flipping a sealed badge
// back to "unsealed". Negative reads cache briefly so a fresh seal still shows up
// soon, while still bounding RPC fan-out.
const _sealCache = new Map<string, { value: OnChainSeal | null; expires: number }>();
const SEALED_TTL_MS = 5 * 60_000;
const NULL_TTL_MS = 20_000;

/**
 * Read the on-chain seal record for a token.
 * Returns null when SOUL_SEAL_ADDRESS is unset, on any RPC error/timeout,
 * or when the gotchi has never been sealed (blockNumber === 0).
 * Never throws — the GET /api/soul/:id path depends on this failing safe.
 */
export async function readOnChainSeal(
  tokenId: string
): Promise<OnChainSeal | null> {
  const sealAddress = getSealAddress();
  if (!sealAddress) return null;

  const key = String(tokenId);
  const cached = _sealCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const result = (await sealClient().readContract({
      address:      sealAddress as `0x${string}`,
      abi:          GET_SEAL_ABI,
      functionName: "getSeal",
      args:         [BigInt(tokenId)],
    })) as {
      soulHash:    `0x${string}`;
      depthBips:   number;
      soulAgeDays: number;
      blockNumber: bigint;
      sealedBy:    `0x${string}`;
    };

    // blockNumber === 0n means this tokenId has never been sealed.
    if (!result || result.blockNumber === 0n) {
      _sealCache.set(key, { value: null, expires: Date.now() + NULL_TTL_MS });
      return null;
    }

    const out: OnChainSeal = {
      soulHash:    result.soulHash,
      depthBips:   Number(result.depthBips),
      soulAgeDays: Number(result.soulAgeDays),
      blockNumber: Number(result.blockNumber),
    };
    _sealCache.set(key, { value: out, expires: Date.now() + SEALED_TTL_MS });
    return out;
  } catch {
    // Transient RPC failure — don't cache; fail safe to "unsealed".
    return null;
  }
}

/**
 * Batch seal-status read for many tokenIds in a single Multicall3 eth_call.
 * Returns a map tokenId -> sealed(boolean). Cache-aware: cached ids are served
 * without RPC, only the unknowns are multicalled. Never throws — missing/failed
 * ids fail safe to false (unsealed).
 */
export async function readOnChainSealsBatch(
  tokenIds: string[]
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  const sealAddress = getSealAddress();
  if (!sealAddress || tokenIds.length === 0) return out;

  // De-dupe + serve from cache; collect the ids that still need an RPC read.
  // A non-numeric id can't be a tokenId — fail it safe individually so one bad
  // id can never poison the rest of the batch (BigInt() would otherwise throw
  // while building the multicall args and zero out every other id).
  const need: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokenIds) {
    const id = String(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!/^\d+$/.test(id)) { out[id] = false; continue; }
    const cached = _sealCache.get(id);
    if (cached && cached.expires > Date.now()) out[id] = cached.value !== null;
    else need.push(id);
  }
  if (need.length === 0) return out;

  try {
    const results = await sealClient().multicall({
      allowFailure: true,
      contracts: need.map((id) => ({
        address: sealAddress as `0x${string}`,
        abi: GET_SEAL_ABI,
        functionName: "getSeal",
        args: [BigInt(id)],
      })),
    });

    results.forEach((r, i) => {
      const id = need[i];
      if (r.status === "success" && r.result) {
        const rec = r.result as unknown as {
          soulHash: `0x${string}`;
          depthBips: number;
          soulAgeDays: number;
          blockNumber: bigint;
        };
        const sealed = rec.blockNumber !== 0n;
        out[id] = sealed;
        // Keep the cache consistent with readOnChainSeal's shape + TTLs.
        if (sealed) {
          _sealCache.set(id, {
            value: {
              soulHash: rec.soulHash,
              depthBips: Number(rec.depthBips),
              soulAgeDays: Number(rec.soulAgeDays),
              blockNumber: Number(rec.blockNumber),
            },
            expires: Date.now() + SEALED_TTL_MS,
          });
        } else {
          _sealCache.set(id, { value: null, expires: Date.now() + NULL_TTL_MS });
        }
      } else {
        out[id] = false; // fail safe
      }
    });
    return out;
  } catch {
    for (const id of need) if (!(id in out)) out[id] = false;
    return out;
  }
}
