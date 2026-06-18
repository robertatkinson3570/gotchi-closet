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

/**
 * Read the on-chain seal record for a token.
 * Returns null when SOUL_SEAL_ADDRESS is unset, on any RPC error,
 * or when the gotchi has never been sealed (blockNumber === 0).
 */
export async function readOnChainSeal(
  tokenId: string
): Promise<{
  soulHash: string;
  depthBips: number;
  soulAgeDays: number;
  blockNumber: number;
} | null> {
  const sealAddress = getSealAddress();
  if (!sealAddress) return null;

  try {
    const client = createPublicClient({
      chain:     base,
      transport: http(getBaseRpcUrl()),
    });

    const result = await client.readContract({
      address:      sealAddress as `0x${string}`,
      abi:          GET_SEAL_ABI,
      functionName: "getSeal",
      args:         [BigInt(tokenId)],
    }) as {
      soulHash:    `0x${string}`;
      depthBips:   number;
      soulAgeDays: number;
      blockNumber: bigint;
      sealedBy:    `0x${string}`;
    };

    // blockNumber === 0n means this tokenId has never been sealed
    if (!result || result.blockNumber === 0n) return null;

    return {
      soulHash:    result.soulHash,
      depthBips:   Number(result.depthBips),
      soulAgeDays: Number(result.soulAgeDays),
      blockNumber: Number(result.blockNumber),
    };
  } catch {
    return null;
  }
}
