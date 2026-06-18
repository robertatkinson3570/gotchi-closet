import { describe, it, expect, afterEach, vi } from "vitest";
import { recoverTypedDataAddress } from "viem";
import {
  sealConfigured,
  buildSealAttestation,
  readOnChainSeal,
  SEAL_DOMAIN_NAME,
  type SealPayload,
} from "./seal";

// Anvil test key #0 — well-known, safe to include in tests.
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_SEAL_ADDRESS =
  "0x1234000000000000000000000000000000000001";

// EIP-712 types must match seal.ts exactly for recoverTypedDataAddress.
const SEAL_TYPES = {
  SealPayload: [
    { name: "tokenId",     type: "uint256" },
    { name: "soulHash",    type: "bytes32" },
    { name: "depthBips",   type: "uint16"  },
    { name: "soulAgeDays", type: "uint16"  },
    { name: "nonce",       type: "uint256" },
  ],
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. sealConfigured() — returns false when env vars absent
// ---------------------------------------------------------------------------

describe("sealConfigured()", () => {
  it("returns false when SOUL_SEAL_ADDRESS and SOUL_ATTESTOR_KEY are not set", () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", "");
    vi.stubEnv("SOUL_ATTESTOR_KEY", "");
    expect(sealConfigured()).toBe(false);
  });

  it("returns false when only SOUL_SEAL_ADDRESS is set", () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", TEST_SEAL_ADDRESS);
    vi.stubEnv("SOUL_ATTESTOR_KEY", "");
    expect(sealConfigured()).toBe(false);
  });

  it("returns false when only SOUL_ATTESTOR_KEY is set", () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", "");
    vi.stubEnv("SOUL_ATTESTOR_KEY", TEST_PRIVATE_KEY);
    expect(sealConfigured()).toBe(false);
  });

  it("returns true when both are set", () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", TEST_SEAL_ADDRESS);
    vi.stubEnv("SOUL_ATTESTOR_KEY", TEST_PRIVATE_KEY);
    expect(sealConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. buildSealAttestation() — returns null when unconfigured
// ---------------------------------------------------------------------------

describe("buildSealAttestation() — unconfigured", () => {
  it("returns null when env vars are not set", async () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", "");
    vi.stubEnv("SOUL_ATTESTOR_KEY", "");

    const result = await buildSealAttestation({
      tokenId:     "42",
      soulHash:    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      depthBips:   7250,
      soulAgeDays: 30,
      nonce:       "1234567890",
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. buildSealAttestation() — produces a valid, recoverable EIP-712 sig
// ---------------------------------------------------------------------------

describe("buildSealAttestation() — configured", () => {
  it("returns attestorSig starting with 0x and sig is recoverable", async () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", TEST_SEAL_ADDRESS);
    vi.stubEnv("SOUL_ATTESTOR_KEY", TEST_PRIVATE_KEY);

    const payload: SealPayload = {
      tokenId:     "3",
      soulHash:    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      depthBips:   6500,
      soulAgeDays: 14,
      nonce:       "1718668800000",
    };

    const result = await buildSealAttestation(payload);

    expect(result).not.toBeNull();
    expect(result!.attestorSig).toMatch(/^0x/);
    expect(result!.contract).toBe(TEST_SEAL_ADDRESS);
    expect(result!.payload).toEqual(payload);

    // Recover the signer and verify it matches the address derived from the key.
    const { privateKeyToAccount } = await import("viem/accounts");
    const expectedAddress = privateKeyToAccount(TEST_PRIVATE_KEY).address;

    const recovered = await recoverTypedDataAddress({
      domain: {
        name:              SEAL_DOMAIN_NAME,
        version:           "1",
        chainId:           8453,
        verifyingContract: TEST_SEAL_ADDRESS as `0x${string}`,
      },
      types:       SEAL_TYPES,
      primaryType: "SealPayload",
      message: {
        tokenId:     BigInt(payload.tokenId),
        soulHash:    payload.soulHash,
        depthBips:   payload.depthBips,
        soulAgeDays: payload.soulAgeDays,
        nonce:       BigInt(payload.nonce),
      },
      signature: result!.attestorSig,
    });

    expect(recovered.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// 4. readOnChainSeal() — returns null when SOUL_SEAL_ADDRESS is unset
// ---------------------------------------------------------------------------

describe("readOnChainSeal() — unconfigured", () => {
  it("returns null without making a network call when SOUL_SEAL_ADDRESS is not set", async () => {
    vi.stubEnv("SOUL_SEAL_ADDRESS", "");

    // No mock of createPublicClient needed — the function must short-circuit.
    const result = await readOnChainSeal("3");
    expect(result).toBeNull();
  });
});
