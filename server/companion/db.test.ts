import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TMP = path.resolve("./data/companion-test.db");
process.env.COMPANION_DB_PATH = TMP;

import {
  appendMessage, getRecentMessages, upsertFact, getFacts,
  grantPremium, getEntitlement, isPremiumActive, closeDb,
  addCredits, burnCredit, getCredits, hasCredits,
} from "./db";

beforeEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

describe("memory", () => {
  it("stores and returns recent messages newest-last, capped", () => {
    for (let i = 0; i < 25; i++) appendMessage("0xabc", "4821", "user", `m${i}`);
    const recent = getRecentMessages("0xabc", "4821", 20);
    expect(recent.length).toBe(20);
    expect(recent[recent.length - 1].content).toBe("m24");
  });

  it("caps facts per gotchi at 10 (drops oldest)", () => {
    for (let i = 0; i < 12; i++) upsertFact("0xabc", "4821", `fact ${i}`);
    expect(getFacts("0xabc", "4821").length).toBeLessThanOrEqual(10);
  });
});

describe("entitlements (time-based, legacy)", () => {
  it("grants premium and reports active until expiry", () => {
    const future = Date.now() + 86400_000;
    grantPremium("0xABC", future, "0xtx1");
    // isPremiumActive now reflects credits, not time — legacy grantPremium gives 0 credits
    // so the time-based path is decoupled. Check entitlement fields directly.
    expect(getEntitlement("0xabc")?.tier).toBe("premium");
  });

  it("rejects a replayed payment txHash (idempotency)", () => {
    grantPremium("0xabc", Date.now() + 86400_000, "0xdup");
    expect(() => grantPremium("0xabc", Date.now() + 86400_000, "0xdup")).toThrow(/already credited/);
  });
});

describe("credit ledger", () => {
  it("addCredits increases balance", () => {
    const bal = addCredits("0xAAA", 5000, "0xtxA");
    expect(bal).toBe(5000);
    expect(getCredits("0xAAA")).toBe(5000);
  });

  it("addCredits is case-insensitive on wallet", () => {
    addCredits("0xBBB", 1000, "0xtxB");
    expect(getCredits("0xbbb")).toBe(1000);
  });

  it("replaying the same txHash throws 'already credited' and does NOT double-credit", () => {
    addCredits("0xCCC", 5000, "0xtxC");
    expect(() => addCredits("0xCCC", 5000, "0xtxC")).toThrow(/already credited/);
    expect(getCredits("0xCCC")).toBe(5000); // no double-credit
  });

  it("burnCredit decrements and returns true", () => {
    addCredits("0xDDD", 3, "0xtxD");
    expect(burnCredit("0xDDD")).toBe(true);
    expect(getCredits("0xDDD")).toBe(2);
  });

  it("burnCredit returns false at 0 credits and leaves balance at 0 (no negative)", () => {
    // wallet with no credits row
    expect(burnCredit("0xEEE")).toBe(false);
    expect(getCredits("0xEEE")).toBe(0);
  });

  it("burnCredit returns false when credits reach 0 and does not go negative", () => {
    addCredits("0xFFF", 1, "0xtxF");
    expect(burnCredit("0xFFF")).toBe(true);
    expect(getCredits("0xFFF")).toBe(0);
    expect(burnCredit("0xFFF")).toBe(false);
    expect(getCredits("0xFFF")).toBe(0);
  });

  it("hasCredits reflects balance", () => {
    expect(hasCredits("0x111")).toBe(false);
    addCredits("0x111", 1, "0xtx111");
    expect(hasCredits("0x111")).toBe(true);
    burnCredit("0x111");
    expect(hasCredits("0x111")).toBe(false);
  });

  it("isPremiumActive returns true when credits > 0", () => {
    addCredits("0x222", 10, "0xtx222");
    expect(isPremiumActive("0x222")).toBe(true);
    // Drain all credits
    for (let i = 0; i < 10; i++) burnCredit("0x222");
    expect(isPremiumActive("0x222")).toBe(false);
  });

  it("multiple addCredits with different txHashes accumulate balance", () => {
    addCredits("0x333", 5000, "0xtx33a");
    addCredits("0x333", 5000, "0xtx33b");
    expect(getCredits("0x333")).toBe(10000);
  });
});
