import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeEventTopics, encodeAbiParameters, parseAbiItem } from "viem";

// ---------------------------------------------------------------------------
// Mock viem: replace createPublicClient/http so the module-level client in
// verifyPayment.ts uses our fake getTransactionReceipt. Keep the REAL
// parseAbiItem / decodeEventLog so log decoding is exercised for real.
// ---------------------------------------------------------------------------
const mockGetTransactionReceipt = vi.fn();
const mockGetBlockNumber = vi.fn();

vi.mock("viem", async (importActual) => {
  const actual = await importActual<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransactionReceipt: mockGetTransactionReceipt,
      getBlockNumber: mockGetBlockNumber,
    })),
    http: vi.fn(() => ({})),
  };
});

import { verifyGhstPayment } from "./verifyPayment";

// GHST on Base — must match the constant inside verifyPayment.ts.
const GHST_BASE = "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB";
const OTHER_TOKEN = "0x000000000000000000000000000000000000dEaD";

const FROM = "0x1111111111111111111111111111111111111111" as const;
const TO = "0x2222222222222222222222222222222222222222" as const;
const TX = "0xabc0000000000000000000000000000000000000000000000000000000000001" as const;

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

// Build a realistic ERC-20 Transfer log that viem's decodeEventLog can decode.
function transferLog(args: {
  address: string;
  from: string;
  to: string;
  value: bigint;
}) {
  return {
    address: args.address as `0x${string}`,
    topics: encodeEventTopics({
      abi: [TRANSFER_EVENT],
      eventName: "Transfer",
      args: { from: args.from as `0x${string}`, to: args.to as `0x${string}` },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [args.value]),
  };
}

function receipt(logs: any[], status: "success" | "reverted" = "success") {
  return { status, blockNumber: 123n, logs };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: chain head far ahead of the receipt block (123n) so the
  // confirmation-depth gate passes; individual tests override as needed.
  mockGetBlockNumber.mockResolvedValue(200n);
});

describe("verifyGhstPayment", () => {
  const value = 4_500_000_000_000_000_000n; // 4.5 GHST

  it("ok:true for a valid GHST Transfer with exact from/to/value", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valueWei).toBe(value);
      expect(r.blockNumber).toBe(123n);
      expect(r.from.toLowerCase()).toBe(FROM.toLowerCase());
      expect(r.to.toLowerCase()).toBe(TO.toLowerCase());
    }
  });

  it("matches case-insensitively on from/to addresses", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM.toUpperCase().replace("0X", "0x") as `0x${string}`,
      expectedTo: TO.toUpperCase().replace("0X", "0x") as `0x${string}`,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(true);
  });

  it("ok:false 'tx not found' when receipt is null", async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("tx not found");
  });

  it("ok:false 'tx reverted' when status != success", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt(
        [transferLog({ address: GHST_BASE, from: FROM, to: TO, value })],
        "reverted"
      )
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("tx reverted");
  });

  it("no match when 'from' differs", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: "0x9999999999999999999999999999999999999999",
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no matching/i);
  });

  it("no match when 'to' differs", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: "0x9999999999999999999999999999999999999999",
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no matching/i);
  });

  it("no match on off-by-one value (exact-value required)", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value - 1n,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no matching/i);
  });

  it("ignores a Transfer emitted by a non-GHST contract", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: OTHER_TOKEN, from: FROM, to: TO, value })])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no matching/i);
  });

  it("picks the matching GHST log among multiple logs", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([
        // wrong emitter
        transferLog({ address: OTHER_TOKEN, from: FROM, to: TO, value }),
        // GHST but wrong value
        transferLog({ address: GHST_BASE, from: FROM, to: TO, value: 1n }),
        // the correct one
        transferLog({ address: GHST_BASE, from: FROM, to: TO, value }),
      ])
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valueWei).toBe(value);
  });

  it("returns ok:false with the error message when the RPC call throws", async () => {
    mockGetTransactionReceipt.mockRejectedValue(
      Object.assign(new Error("network boom"), { shortMessage: "network boom" })
    );

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("network boom");
  });

  // Confirmation-depth gate (plan 002): a matching transfer that is not yet
  // MIN_CONFIRMATIONS (5) blocks deep must be rejected to resist reorgs.
  it("rejects a matching tx without enough confirmations", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );
    mockGetBlockNumber.mockResolvedValue(124n); // receipt at 123n => 1 confirmation < 5

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/confirmation/i);
  });

  it("accepts a matching tx confirmed deep enough (>= MIN_CONFIRMATIONS)", async () => {
    mockGetTransactionReceipt.mockResolvedValue(
      receipt([transferLog({ address: GHST_BASE, from: FROM, to: TO, value })])
    );
    mockGetBlockNumber.mockResolvedValue(123n + 5n); // exactly 5 confirmations

    const r = await verifyGhstPayment({
      txHash: TX,
      expectedFrom: FROM,
      expectedTo: TO,
      expectedValueWei: value,
    });

    expect(r.ok).toBe(true);
  });
});
