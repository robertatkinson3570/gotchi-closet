import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate to a throwaway DB so this test never touches dev data.
process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-accounts-test-${process.pid}.db`);

import { createAccount, getAccountByKey, activatePlan, effectivePlan, consumeRequest } from "./accounts";
import { closeDb } from "../companion/db";

afterAll(() => closeDb());

describe("wisp accounts ledger", () => {
  it("mints a unique, prefixed api key on the free plan", () => {
    const a = createAccount("0xABCdef0000000000000000000000000000000001");
    const b = createAccount();
    expect(a.apiKey).toMatch(/^wsp_[0-9a-f]{48}$/);
    expect(a.apiKey).not.toBe(b.apiKey);
    expect(a.plan).toBe("free");
    expect(a.ownerWallet).toBe("0xabcdef0000000000000000000000000000000001");
    expect(b.ownerWallet).toBeNull();
  });

  it("activates a plan idempotently — the same tx can't be credited twice", () => {
    const a = createAccount();
    const after = activatePlan({ apiKey: a.apiKey, plan: "pro", months: 3, asset: "eth", amountWei: 1n, txHash: "0xtx1" });
    expect(after.plan).toBe("pro");
    expect(after.expiresAt).toBeGreaterThan(Date.now());
    expect(() =>
      activatePlan({ apiKey: a.apiKey, plan: "pro", months: 3, asset: "eth", amountWei: 1n, txHash: "0xtx1" })
    ).toThrow(/already credited/);
  });

  it("effectivePlan reverts to free after the prepaid period lapses", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "studio", months: 1, asset: "usdc", amountWei: 1n, txHash: "0xtx2" });
    const acct = getAccountByKey(a.apiKey)!;
    expect(effectivePlan(acct, Date.now())).toBe("studio");
    expect(effectivePlan(acct, acct.expiresAt + 1)).toBe("free");
  });
});

describe("wisp rate limiting (the plan limits actually work)", () => {
  it("free plan allows up to its daily limit, then blocks", () => {
    const a = createAccount();
    const first = consumeRequest(a.apiKey);
    expect(first.allowed).toBe(true);
    expect(first.plan).toBe("free");
    expect(first.limitPerDay).toBe(1000);
    // consume up to the daily cap (we already spent 1)
    for (let i = 1; i < first.limitPerDay; i++) consumeRequest(a.apiKey);
    const over = consumeRequest(a.apiKey); // (limit + 1)th request
    expect(over.allowed).toBe(false);
    expect(over.reason).toMatch(/daily/);
  });

  it("a paid plan lifts the limit (and lapses back to free on expiry)", () => {
    const a = createAccount();
    activatePlan({ apiKey: a.apiKey, plan: "pro", months: 1, asset: "eth", amountWei: 1n, txHash: "0xrl1" });
    const r = consumeRequest(a.apiKey);
    expect(r.allowed).toBe(true);
    expect(r.plan).toBe("pro");
    expect(r.limitPerDay).toBe(25000);
    // after expiry, consumeRequest sees the free limit
    const acct = getAccountByKey(a.apiKey)!;
    expect(consumeRequest(a.apiKey, acct.expiresAt + 1).limitPerDay).toBe(1000);
  });

  it("rejects an invalid api key", () => {
    const r = consumeRequest("wsp_does_not_exist");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/invalid/);
  });
});
