import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Throwaway key — Anvil/Hardhat well-known account #0. NEVER a real key.
// ---------------------------------------------------------------------------
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// ---------------------------------------------------------------------------
// Mock viem so the wallet/public clients are fakes we control. Keep everything
// else from viem real (not needed here, but harmless).
// ---------------------------------------------------------------------------
const mockWriteContract = vi.fn();
const mockWaitForReceipt = vi.fn();

vi.mock("viem", async (importActual) => {
  const actual = await importActual<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      account: { address: TEST_ADDRESS },
      writeContract: mockWriteContract,
    })),
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: mockWaitForReceipt,
    })),
    http: vi.fn(() => ({})),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: TEST_ADDRESS })),
}));

import { initWallet, getOperatorAddress, maybeRelist } from "./relist";
import type { Template } from "./db";

// Build a Template fixture.
function tmpl(overrides: Partial<Template> = {}): Template {
  return {
    token_id: 4821,
    owner: "0xabc0000000000000000000000000000000000001",
    initial_cost_wei: "1000000000000000000",
    period_seconds: 86400,
    split_owner: 60,
    split_borrower: 40,
    split_other: 0,
    third_party: "0x0000000000000000000000000000000000000000",
    whitelist_id: 0,
    channelling: 1,
    enabled: 1,
    last_relist_at: null,
    last_relist_listing_id: null,
    last_error: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

// Fake a subgraph response for getActiveLendingState.
function stubSubgraph(lending: any | null, opts: { ok?: boolean; status?: number; errors?: any } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => ({
        data: { gotchiLendings: lending ? [lending] : [] },
        ...(opts.errors ? { errors: opts.errors } : {}),
      }),
    }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTORENEW_HOT_WALLET_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// initWallet — env gating
// ---------------------------------------------------------------------------

describe("initWallet", () => {
  it("returns false when AUTORENEW_HOT_WALLET_KEY is unset (cron must not start)", () => {
    delete process.env.AUTORENEW_HOT_WALLET_KEY;
    expect(initWallet()).toBe(false);
  });

  it("returns true and sets the operator address when the key is set", () => {
    process.env.AUTORENEW_HOT_WALLET_KEY = TEST_PRIVATE_KEY;
    expect(initWallet()).toBe(true);
    expect(getOperatorAddress()).toBe(TEST_ADDRESS);
  });
});

// ---------------------------------------------------------------------------
// maybeRelist — guard when wallet not initialized
//
// NOTE: relist.ts caches walletClient at module scope with no reset export.
// Once initWallet() runs (in the test above), the singleton stays set for the
// rest of this file. To test the uninitialized branch in isolation we reset
// modules and re-import without calling initWallet.
// ---------------------------------------------------------------------------

describe("maybeRelist — wallet not initialized", () => {
  it("returns an error without touching the chain", async () => {
    vi.resetModules();
    const fresh = await import("./relist");
    const r = await fresh.maybeRelist(tmpl());
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not initialized/i);
    expect(mockWriteContract).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// maybeRelist — state machine (wallet initialized)
// ---------------------------------------------------------------------------

describe("maybeRelist — state machine", () => {
  beforeEach(() => {
    process.env.AUTORENEW_HOT_WALLET_KEY = TEST_PRIVATE_KEY;
    expect(initWallet()).toBe(true);
  });

  it("state 'none' → addGotchiListing, returns success on receipt success", async () => {
    stubSubgraph(null); // no active lending row → kind: none
    mockWriteContract.mockResolvedValue("0xrelistTx");
    mockWaitForReceipt.mockResolvedValue({ status: "success" });

    const r = await maybeRelist(tmpl());

    expect(mockWriteContract).toHaveBeenCalledTimes(1);
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe("addGotchiListing");
    expect(r).toEqual({ success: true, txHash: "0xrelistTx", error: null });
  });

  it("state 'open' (borrower null) → no tx, 'already-active'", async () => {
    stubSubgraph({ id: "1", borrower: null, timeAgreed: "0", period: "0" });

    const r = await maybeRelist(tmpl());

    expect(mockWriteContract).not.toHaveBeenCalled();
    expect(r).toEqual({ success: false, txHash: null, error: "already-active" });
  });

  it("state 'rented_active' (period not yet passed) → no tx, 'already-active'", async () => {
    const now = Math.floor(Date.now() / 1000);
    stubSubgraph({
      id: "2",
      borrower: "0xborrower",
      timeAgreed: String(now),
      period: "100000", // expires well in the future
    });

    const r = await maybeRelist(tmpl());

    expect(mockWriteContract).not.toHaveBeenCalled();
    expect(r.error).toBe("already-active");
  });

  it("state 'rented_expired' → claimAndEnd then addGotchiListing (two writes)", async () => {
    const past = Math.floor(Date.now() / 1000) - 1_000_000;
    stubSubgraph({
      id: "3",
      borrower: "0xborrower",
      timeAgreed: String(past),
      period: "100", // already expired
    });

    // First writeContract = claimAndEndGotchiLending, second = addGotchiListing.
    mockWriteContract
      .mockResolvedValueOnce("0xclaimTx")
      .mockResolvedValueOnce("0xrelistTx");
    mockWaitForReceipt.mockResolvedValue({ status: "success" });

    const r = await maybeRelist(tmpl());

    expect(mockWriteContract).toHaveBeenCalledTimes(2);
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe("claimAndEndGotchiLending");
    expect(mockWriteContract.mock.calls[1][0].functionName).toBe("addGotchiListing");
    expect(r).toEqual({ success: true, txHash: "0xrelistTx", error: null });
  });

  it("rented_expired with a failing claim surfaces a 'claim-and-end' error and does NOT relist", async () => {
    const past = Math.floor(Date.now() / 1000) - 1_000_000;
    stubSubgraph({
      id: "4",
      borrower: "0xborrower",
      timeAgreed: String(past),
      period: "100",
    });

    // claim tx succeeds to mine but reverts on-chain.
    mockWriteContract.mockResolvedValueOnce("0xclaimTx");
    mockWaitForReceipt.mockResolvedValueOnce({ status: "reverted" });

    const r = await maybeRelist(tmpl());

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/claim-and-end/i);
    // Only the claim write happened; relist was skipped.
    expect(mockWriteContract).toHaveBeenCalledTimes(1);
  });

  it("addGotchiListing receipt reverted → success false, 'tx reverted'", async () => {
    stubSubgraph(null);
    mockWriteContract.mockResolvedValue("0xrelistTx");
    mockWaitForReceipt.mockResolvedValue({ status: "reverted" });

    const r = await maybeRelist(tmpl());

    expect(r).toEqual({ success: false, txHash: "0xrelistTx", error: "tx reverted" });
  });

  it("a write that throws is caught and returned as an error string", async () => {
    stubSubgraph(null);
    mockWriteContract.mockRejectedValue(
      Object.assign(new Error("insufficient funds"), { shortMessage: "insufficient funds" })
    );

    const r = await maybeRelist(tmpl());

    expect(r.success).toBe(false);
    expect(r.error).toBe("insufficient funds");
  });

  it("a subgraph HTTP error surfaces as an error (no chain write)", async () => {
    stubSubgraph(null, { ok: false, status: 502 });

    const r = await maybeRelist(tmpl());

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/subgraph http 502/i);
    expect(mockWriteContract).not.toHaveBeenCalled();
  });
});
