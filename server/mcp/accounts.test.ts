import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate to a throwaway DB so this test never touches dev data.
process.env.COMPANION_DB_PATH = join(tmpdir(), `wisp-accounts-test-${process.pid}.db`);

import { createAccount, getAccountByKey, activatePlan, effectivePlan } from "./accounts";
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
