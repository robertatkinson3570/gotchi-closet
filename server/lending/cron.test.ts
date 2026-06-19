import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Template } from "./db";

// ---------------------------------------------------------------------------
// cron.ts exports only startAutoRenewCron(); the per-tick logic is an anonymous
// callback handed to cron.schedule(). To exercise the expiry-gating logic we
// mock node-cron to CAPTURE that callback, mock ./db and ./relist, then invoke
// the captured callback directly.
// ---------------------------------------------------------------------------

let capturedTick: (() => Promise<void>) | null = null;

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((_expr: string, cb: () => Promise<void>) => {
      capturedTick = cb;
      return { stop: vi.fn() };
    }),
  },
}));

vi.mock("./db", () => ({
  listEnabledTemplates: vi.fn(),
  recordRelist: vi.fn(),
  isSubscriptionActive: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock("./relist", () => ({
  initWallet: vi.fn(() => true), // pretend the wallet is configured so the cron starts
  maybeRelist: vi.fn(),
  getOperatorAddress: vi.fn(() => "0xoperator"),
}));

import { startAutoRenewCron } from "./cron";
import {
  listEnabledTemplates,
  recordRelist,
  isSubscriptionActive,
  getSubscription,
} from "./db";
import { initWallet, maybeRelist } from "./relist";

const mockList = vi.mocked(listEnabledTemplates);
const mockRecord = vi.mocked(recordRelist);
const mockActive = vi.mocked(isSubscriptionActive);
const mockGetSub = vi.mocked(getSubscription);
const mockInitWallet = vi.mocked(initWallet);
const mockMaybeRelist = vi.mocked(maybeRelist);

function tmpl(token_id: number): Template {
  return {
    token_id,
    owner: "0xowner",
    initial_cost_wei: "1",
    period_seconds: 86400,
    split_owner: 60,
    split_borrower: 40,
    split_other: 0,
    third_party: "0x0000000000000000000000000000000000000000",
    whitelist_id: 0,
    channelling: 0,
    enabled: 1,
    last_relist_at: null,
    last_relist_listing_id: null,
    last_error: null,
    created_at: 0,
    updated_at: 0,
  };
}

// Fresh module + fresh captured tick per test (the `started` flag in cron.ts is
// module-level, so we must reset modules to call startAutoRenewCron again).
async function startAndCaptureTick(): Promise<() => Promise<void>> {
  vi.resetModules();
  capturedTick = null;
  const mod = await import("./cron");
  mod.startAutoRenewCron();
  if (!capturedTick) throw new Error("tick callback was not scheduled");
  return capturedTick;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInitWallet.mockReturnValue(true);
  mockGetSub.mockReturnValue({
    token_id: 0,
    owner: "0xowner",
    months_paid_total: 1,
    expires_at: Math.floor(Date.now() / 1000) + 100000,
    last_payment_tx: "0x",
    last_payment_ghst: "0",
    last_payment_at: 0,
    created_at: 0,
    updated_at: 0,
  });
});

describe("startAutoRenewCron — gating", () => {
  it("does not schedule a tick when initWallet() returns false", async () => {
    vi.resetModules();
    capturedTick = null;
    mockInitWallet.mockReturnValue(false);
    const mod = await import("./cron");
    mod.startAutoRenewCron();
    expect(capturedTick).toBeNull();
  });

  it("calls maybeRelist ONLY for tokens with an active subscription", async () => {
    mockList.mockReturnValue([tmpl(1), tmpl(2), tmpl(3)]);
    // token 1 active, 2 inactive, 3 active
    mockActive.mockImplementation((id: number) => id === 1 || id === 3);
    mockMaybeRelist.mockResolvedValue({ success: true, txHash: "0xtx", error: null });

    const tick = await startAndCaptureTick();
    await tick();

    expect(mockMaybeRelist).toHaveBeenCalledTimes(2);
    const relistedTokens = mockMaybeRelist.mock.calls.map((c) => c[0].token_id);
    expect(relistedTokens).toEqual([1, 3]);
  });

  it("skips templates with no/expired subscription (no relist, no record)", async () => {
    mockList.mockReturnValue([tmpl(1), tmpl(2)]);
    mockActive.mockReturnValue(false); // none active
    mockMaybeRelist.mockResolvedValue({ success: true, txHash: "0xtx", error: null });

    const tick = await startAndCaptureTick();
    await tick();

    expect(mockMaybeRelist).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("records a successful relist", async () => {
    mockList.mockReturnValue([tmpl(7)]);
    mockActive.mockReturnValue(true);
    mockMaybeRelist.mockResolvedValue({ success: true, txHash: "0xabc", error: null });

    const tick = await startAndCaptureTick();
    await tick();

    expect(mockRecord).toHaveBeenCalledWith(7, "0xabc", true, null);
  });

  it("does NOT record when maybeRelist returns 'already-active'", async () => {
    mockList.mockReturnValue([tmpl(8)]);
    mockActive.mockReturnValue(true);
    mockMaybeRelist.mockResolvedValue({ success: false, txHash: null, error: "already-active" });

    const tick = await startAndCaptureTick();
    await tick();

    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("records a failed relist with its error and CONTINUES the loop", async () => {
    mockList.mockReturnValue([tmpl(1), tmpl(2)]);
    mockActive.mockReturnValue(true);
    // First token fails, second succeeds — loop must not abort on the failure.
    mockMaybeRelist
      .mockResolvedValueOnce({ success: false, txHash: null, error: "boom" })
      .mockResolvedValueOnce({ success: true, txHash: "0xok", error: null });

    const tick = await startAndCaptureTick();
    await tick();

    expect(mockMaybeRelist).toHaveBeenCalledTimes(2);
    expect(mockRecord).toHaveBeenCalledWith(1, null, false, "boom");
    expect(mockRecord).toHaveBeenCalledWith(2, "0xok", true, null);
  });

  it("returns early (no relist) when there are no enabled templates", async () => {
    mockList.mockReturnValue([]);

    const tick = await startAndCaptureTick();
    await tick();

    expect(mockActive).not.toHaveBeenCalled();
    expect(mockMaybeRelist).not.toHaveBeenCalled();
  });

  it("a throwing maybeRelist is caught by the tick's try/catch (does not reject)", async () => {
    mockList.mockReturnValue([tmpl(1)]);
    mockActive.mockReturnValue(true);
    mockMaybeRelist.mockRejectedValue(new Error("unexpected"));

    const tick = await startAndCaptureTick();
    // The tick wraps its body in try/catch, so it should resolve, not reject.
    await expect(tick()).resolves.toBeUndefined();
  });
});
